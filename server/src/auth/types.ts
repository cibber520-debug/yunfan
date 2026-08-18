import type { Request } from 'express';

export type VerificationPurpose = 'REGISTER' | 'LOGIN';
export type VerificationChannel = 'EMAIL' | 'SMS';

export interface AuthUser {
  id: number;
  email?: string;
  phone?: string;
  displayName: string;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
}

export interface VerificationMailer {
  sendVerificationCode(input: { to: string; code: string; purpose: VerificationPurpose }): Promise<void>;
}

export interface VerificationSmsSender {
  sendVerificationCode(input: { to: string; code: string; purpose: VerificationPurpose }): Promise<void>;
}
