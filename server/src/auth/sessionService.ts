import type { PoolClient } from 'pg';
import { config } from '../config';
import { pool } from '../db/pool';
import { generateSessionToken, sessionTokenHash } from './crypto';
import type { AuthUser } from './types';

type QueryExecutor = typeof pool | PoolClient;

interface SessionRow {
  session_id: number;
  user_id: number;
  email: string | null;
  phone: string | null;
  display_name: string;
}

export class SessionService {
  async create(userId: number, client?: PoolClient): Promise<string> {
    const token = generateSessionToken();
    const executor: QueryExecutor = client ?? pool;
    await executor.query(
      `INSERT INTO auth_session (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + ($3 * interval '1 day'))`,
      [userId, sessionTokenHash(token), config.auth.sessionDays],
    );
    return token;
  }

  async resolve(token: string | undefined): Promise<AuthUser | null> {
    if (token === undefined || token.length === 0) return null;
    const result = await pool.query<SessionRow>(
      `SELECT s.id::integer AS session_id, u.id::integer AS user_id, u.email, u.phone, u.display_name
         FROM auth_session s
         JOIN app_user u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
        LIMIT 1`,
      [sessionTokenHash(token)],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    void pool.query('UPDATE auth_session SET last_seen_at = now() WHERE id = $1', [row.session_id]);
    return { id: row.user_id, email: row.email ?? undefined, phone: row.phone ?? undefined, displayName: row.display_name };
  }

  async revoke(token: string | undefined): Promise<void> {
    if (token === undefined || token.length === 0) return;
    await pool.query('UPDATE auth_session SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [sessionTokenHash(token)]);
  }
}
