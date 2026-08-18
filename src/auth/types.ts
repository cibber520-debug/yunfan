import type { WizardDraft } from '../types/domain';

export type VerificationChannel = 'EMAIL' | 'SMS';

export interface AuthUser {
  id: number;
  email?: string;
  phone?: string;
  displayName: string;
}

export interface RemoteProfile {
  draft: WizardDraft;
  completedStep: number;
  selectedVolunteerIds: string[];
  updatedAt: string;
}

export interface AuthApi {
  sendCode(channel: VerificationChannel, contact: string, purpose: 'REGISTER' | 'LOGIN'): Promise<{ expiresInSeconds: number; resendInSeconds: number }>;
  register(channel: VerificationChannel, contact: string, code: string, displayName: string): Promise<AuthUser>;
  login(channel: VerificationChannel, contact: string, code: string): Promise<AuthUser>;
  logout(): Promise<void>;
  me(): Promise<AuthUser | null>;
  getProfile(): Promise<RemoteProfile | null>;
  saveProfile(profile: Omit<RemoteProfile, 'updatedAt'>): Promise<RemoteProfile>;
}
