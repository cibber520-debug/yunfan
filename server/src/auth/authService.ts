import type { PoolClient } from 'pg';
import { config } from '../config';
import { pool } from '../db/pool';
import { serviceError } from '../errors';
import type { WizardDraft } from '../contracts';
import { hashesMatch, generateVerificationCode, normalizeEmail, normalizePhone, normalizeVerificationCode, verificationCodeHash } from './crypto';
import { SessionService } from './sessionService';
import type { AuthUser, VerificationChannel, VerificationMailer, VerificationPurpose, VerificationSmsSender } from './types';

interface AppUserRow {
  id: number;
  email: string | null;
  phone: string | null;
  display_name: string;
}

interface CodeRow {
  id: number;
  code_hash: string;
  attempt_count: number;
}

interface ProfileRow {
  draft: WizardDraft;
  completed_step: number;
  selected_volunteer_ids: string[];
  updated_at: Date | string;
}

export interface PersistedProfile {
  draft: WizardDraft;
  completedStep: number;
  selectedVolunteerIds: string[];
  updatedAt: string;
}

function contactColumn(channel: VerificationChannel): 'email' | 'phone' {
  return channel === 'EMAIL' ? 'email' : 'phone';
}

export class AuthService {
  constructor(
    private readonly mailer: VerificationMailer,
    private readonly smsSender: VerificationSmsSender,
    private readonly sessions: SessionService,
  ) {}

  async sendCode(
    rawContact: unknown,
    channel: VerificationChannel,
    purpose: VerificationPurpose,
    requestIp: string | undefined,
  ): Promise<{ expiresInSeconds: number; resendInSeconds: number }> {
    const contact = channel === 'EMAIL' ? normalizeEmail(rawContact) : normalizePhone(rawContact);
    const column = contactColumn(channel);
    const contactField = channel === 'EMAIL' ? 'email' : 'phone';
    const normalizedRequestIp = requestIp === undefined ? undefined : requestIp.split(',')[0]?.trim();
    const recentByIp = normalizedRequestIp === undefined
      ? 0
      : Number((await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM email_verification_code
          WHERE request_ip = $1::inet AND created_at > now() - interval '1 hour'`,
        [normalizedRequestIp],
      )).rows[0]?.count ?? 0);
    if (recentByIp >= config.auth.maxCodesPerIpHour) {
      throw serviceError('TOO_MANY_REQUESTS', '请求过于频繁，请稍后再试');
    }
    const existing = await this.findUserByContact(contact, channel);
    if (purpose === 'REGISTER' && existing !== null) throw serviceError('CONFLICT', '该账户已经注册，请直接登录', contactField);
    if (purpose === 'LOGIN' && existing === null) throw serviceError('NOT_FOUND', '该账户尚未注册，请先注册', contactField);

    const lastCode = await pool.query<{ created_at: Date | string }>(
      `SELECT created_at
         FROM email_verification_code
        WHERE ${column} = $1 AND purpose = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [contact, purpose],
    );
    const lastCreatedAt = lastCode.rows[0]?.created_at;
    if (lastCreatedAt !== undefined && Date.now() - new Date(lastCreatedAt).getTime() < config.auth.codeResendSeconds * 1000) {
      throw serviceError('TOO_MANY_REQUESTS', `请 ${config.auth.codeResendSeconds} 秒后再获取验证码`);
    }

    const code = generateVerificationCode();
    const codeHash = verificationCodeHash(contact, purpose, code);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM email_verification_code
          WHERE ${column} = $1 AND purpose = $2 AND consumed_at IS NULL`,
        [contact, purpose],
      );
      await client.query(
        `INSERT INTO email_verification_code (${column}, purpose, code_hash, expires_at, request_ip)
         VALUES ($1, $2, $3, now() + ($4 * interval '1 second'), $5)`,
        [contact, purpose, codeHash, config.auth.codeTtlSeconds, normalizedRequestIp ?? null],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    try {
      if (channel === 'EMAIL') {
        await this.mailer.sendVerificationCode({ to: contact, code, purpose });
      } else {
        await this.smsSender.sendVerificationCode({ to: contact, code, purpose });
      }
    } catch (error) {
      await pool.query(
        `DELETE FROM email_verification_code
          WHERE ${column} = $1 AND purpose = $2 AND code_hash = $3 AND consumed_at IS NULL`,
        [contact, purpose, codeHash],
      );
      throw error;
    }
    return { expiresInSeconds: config.auth.codeTtlSeconds, resendInSeconds: config.auth.codeResendSeconds };
  }

  async register(
    rawContact: unknown,
    channel: VerificationChannel,
    rawCode: unknown,
    rawDisplayName: unknown,
  ): Promise<{ user: AuthUser; sessionToken: string }> {
    const contact = channel === 'EMAIL' ? normalizeEmail(rawContact) : normalizePhone(rawContact);
    const code = normalizeVerificationCode(rawCode);
    const displayName = normalizeDisplayName(rawDisplayName);
    const column = contactColumn(channel);
    const client = await pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const verification = await this.consumeCode(client, contact, channel, 'REGISTER', code);
      if (verification !== 'VERIFIED') {
        await client.query('COMMIT');
        committed = true;
        return rejectVerification(verification);
      }
      const existing = await this.findUserByContact(contact, channel, client);
      if (existing !== null) throw serviceError('CONFLICT', '该账户已经注册，请直接登录', channel === 'EMAIL' ? 'email' : 'phone');
      const created = await client.query<AppUserRow>(
        `INSERT INTO app_user (${column}, display_name)
         VALUES ($1, $2)
         RETURNING id::integer AS id, email, phone, display_name`,
        [contact, displayName],
      );
      const row = created.rows[0];
      if (row === undefined) throw serviceError('TEMPORARY_FAILURE', '创建账户失败，请稍后重试');
      const token = await this.sessions.create(row.id, client);
      await client.query('COMMIT');
      committed = true;
      return { user: mapUser(row), sessionToken: token };
    } catch (error) {
      if (!committed) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async login(rawContact: unknown, channel: VerificationChannel, rawCode: unknown): Promise<{ user: AuthUser; sessionToken: string }> {
    const contact = channel === 'EMAIL' ? normalizeEmail(rawContact) : normalizePhone(rawContact);
    const code = normalizeVerificationCode(rawCode);
    const client = await pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const verification = await this.consumeCode(client, contact, channel, 'LOGIN', code);
      if (verification !== 'VERIFIED') {
        await client.query('COMMIT');
        committed = true;
        return rejectVerification(verification);
      }
      const user = await this.findUserByContact(contact, channel, client);
      if (user === null) throw serviceError('NOT_FOUND', '该账户尚未注册，请先注册', channel === 'EMAIL' ? 'email' : 'phone');
      const token = await this.sessions.create(user.id, client);
      await client.query('UPDATE app_user SET last_login_at = now(), updated_at = now() WHERE id = $1', [user.id]);
      await client.query('COMMIT');
      committed = true;
      return { user: mapUser(user), sessionToken: token };
    } catch (error) {
      if (!committed) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getProfile(userId: number): Promise<PersistedProfile | null> {
    const result = await pool.query<ProfileRow>(
      `SELECT draft, completed_step, selected_volunteer_ids, updated_at
         FROM user_profile
        WHERE user_id = $1`,
      [userId],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    return {
      draft: row.draft,
      completedStep: row.completed_step,
      selectedVolunteerIds: row.selected_volunteer_ids ?? [],
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async saveProfile(userId: number, profile: PersistedProfile): Promise<PersistedProfile> {
    validateProfile(profile);
    const result = await pool.query<ProfileRow>(
      `INSERT INTO user_profile (user_id, draft, completed_step, selected_volunteer_ids)
       VALUES ($1, $2::jsonb, $3, $4::jsonb)
       ON CONFLICT (user_id) DO UPDATE
         SET draft = EXCLUDED.draft,
             completed_step = EXCLUDED.completed_step,
             selected_volunteer_ids = EXCLUDED.selected_volunteer_ids,
             updated_at = now()
       RETURNING draft, completed_step, selected_volunteer_ids, updated_at`,
      [userId, JSON.stringify(profile.draft), profile.completedStep, JSON.stringify(profile.selectedVolunteerIds)],
    );
    const row = result.rows[0];
    if (row === undefined) throw serviceError('TEMPORARY_FAILURE', '保存资料失败，请稍后重试');
    return {
      draft: row.draft,
      completedStep: row.completed_step,
      selectedVolunteerIds: row.selected_volunteer_ids ?? [],
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private async consumeCode(
    client: PoolClient,
    contact: string,
    channel: VerificationChannel,
    purpose: VerificationPurpose,
    code: string,
  ): Promise<'VERIFIED' | 'INVALID' | 'TOO_MANY_ATTEMPTS'> {
    const column = contactColumn(channel);
    const result = await client.query<CodeRow>(
      `SELECT id, code_hash, attempt_count
         FROM email_verification_code
        WHERE ${column} = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [contact, purpose],
    );
    const row = result.rows[0];
    if (row === undefined) throw serviceError('INVALID_INPUT', '验证码错误或已过期', 'code');
    if (row.attempt_count >= config.auth.codeMaxAttempts) {
      await client.query('UPDATE email_verification_code SET consumed_at = now() WHERE id = $1', [row.id]);
      return 'TOO_MANY_ATTEMPTS';
    }
    if (!hashesMatch(row.code_hash, verificationCodeHash(contact, purpose, code))) {
      const nextAttemptCount = row.attempt_count + 1;
      await client.query(
        `UPDATE email_verification_code
            SET attempt_count = $2::smallint,
                consumed_at = CASE WHEN $2::smallint >= $3::smallint THEN now() ELSE consumed_at END
          WHERE id = $1`,
        [row.id, nextAttemptCount, config.auth.codeMaxAttempts],
      );
      return nextAttemptCount >= config.auth.codeMaxAttempts ? 'TOO_MANY_ATTEMPTS' : 'INVALID';
    }
    await client.query(
      'UPDATE email_verification_code SET consumed_at = now() WHERE id = $1',
      [row.id],
    );
    return 'VERIFIED';
  }

  private async findUserByContact(contact: string, channel: VerificationChannel, executor: typeof pool | PoolClient = pool): Promise<AppUserRow | null> {
    const column = contactColumn(channel);
    const result = await executor.query<AppUserRow>(
      `SELECT id::integer AS id, email, phone, display_name FROM app_user WHERE ${column} = $1 LIMIT 1`,
      [contact],
    );
    return result.rows[0] ?? null;
  }
}

function rejectVerification(result: 'INVALID' | 'TOO_MANY_ATTEMPTS'): never {
  if (result === 'TOO_MANY_ATTEMPTS') {
    throw serviceError('TOO_MANY_REQUESTS', '验证码尝试次数过多，请重新获取验证码', 'code');
  }
  throw serviceError('INVALID_INPUT', '验证码错误或已过期', 'code');
}

function normalizeDisplayName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length < 1 || name.length > 40) throw serviceError('INVALID_INPUT', '昵称长度需为 1 至 40 个字符', 'displayName');
  return name;
}

function validateProfile(profile: PersistedProfile): void {
  if (typeof profile !== 'object' || profile === null || typeof profile.draft !== 'object' || profile.draft === null) {
    throw serviceError('INVALID_INPUT', '资料格式无效');
  }
  if (!Number.isInteger(profile.completedStep) || profile.completedStep < 0 || profile.completedStep > 6) {
    throw serviceError('INVALID_INPUT', '填写进度无效', 'completedStep');
  }
  if (!Array.isArray(profile.selectedVolunteerIds) || !profile.selectedVolunteerIds.every((value) => typeof value === 'string')) {
    throw serviceError('INVALID_INPUT', '志愿表数据无效', 'selectedVolunteerIds');
  }
}

function mapUser(row: AppUserRow): AuthUser {
  return { id: row.id, email: row.email ?? undefined, phone: row.phone ?? undefined, displayName: row.display_name };
}
