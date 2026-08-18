import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { config, isProduction } from '../config';
import { serviceError } from '../errors';
import type { VerificationPurpose } from './types';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?\d{6,15}$/;

export function normalizeEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length === 0 || email.length > 254 || !emailPattern.test(email)) {
    throw serviceError('INVALID_INPUT', '请输入有效的邮箱地址', 'email');
  }
  return email;
}

export function normalizePhone(value: unknown): string {
  const phone = typeof value === 'string' ? value.trim().replace(/[\s-]/g, '') : '';
  if (phone.length === 0 || !phonePattern.test(phone)) {
    throw serviceError('INVALID_INPUT', '请输入有效的手机号', 'phone');
  }
  return phone;
}

export function normalizeVerificationCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{6}$/.test(code)) throw serviceError('INVALID_INPUT', '请输入 6 位验证码', 'code');
  return code;
}

export function generateVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function assertSecrets(): void {
  if (config.auth.sessionSecret.length >= 32 && config.auth.codePepper.length >= 32) return;
  const message = isProduction
    ? '认证服务尚未配置安全的 AUTH_SESSION_SECRET 和 AUTH_CODE_PEPPER'
    : '认证服务密钥配置无效，请在 server/.env 中配置至少 32 位的认证密钥';
  throw serviceError('TEMPORARY_FAILURE', message);
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function verificationCodeHash(contact: string, purpose: VerificationPurpose, code: string): string {
  assertSecrets();
  return hash(`yunfan:verification:v1:${contact}:${purpose}:${code}:${config.auth.codePepper}`);
}

export function generateSessionToken(): string {
  assertSecrets();
  return randomBytes(32).toString('base64url');
}

export function sessionTokenHash(token: string): string {
  assertSecrets();
  return hash(`yunfan:session:v1:${token}:${config.auth.sessionSecret}`);
}

export function hashesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
