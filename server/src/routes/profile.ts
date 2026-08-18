import { Router } from 'express';
import type { AuthService, PersistedProfile } from '../auth/authService';
import type { AuthenticatedRequest } from '../auth/types';
import { serviceError } from '../errors';
import { asyncHandler } from '../http/asyncHandler';
import { requireUser } from './auth';
import type { SessionService } from '../auth/sessionService';

export function createProfileRouter(auth: AuthService, sessions: SessionService): Router {
  const router = Router();
  router.use(requireUser(sessions));

  router.get('/profile', asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = req.authUser;
    if (user === undefined) throw serviceError('UNAUTHORIZED', '请先登录');
    const profile = await auth.getProfile(user.id);
    res.json({ user, profile });
  }));

  router.put('/profile', asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = req.authUser;
    if (user === undefined) throw serviceError('UNAUTHORIZED', '请先登录');
    const body = bodyRecord(req.body);
    const profile = await auth.saveProfile(user.id, parseProfile(body));
    res.json({ profile });
  }));

  return router;
}

function parseProfile(body: Record<string, unknown>): PersistedProfile {
  const { draft, completedStep, selectedVolunteerIds } = body;
  if (typeof draft !== 'object' || draft === null || Array.isArray(draft)) throw serviceError('INVALID_INPUT', '资料格式无效', 'draft');
  if (!Number.isInteger(completedStep)) throw serviceError('INVALID_INPUT', '填写进度无效', 'completedStep');
  if (!Array.isArray(selectedVolunteerIds) || !selectedVolunteerIds.every((item) => typeof item === 'string')) {
    throw serviceError('INVALID_INPUT', '志愿表数据无效', 'selectedVolunteerIds');
  }
  return {
    draft: draft as PersistedProfile['draft'],
    completedStep: Number(completedStep),
    selectedVolunteerIds,
    updatedAt: '',
  };
}

function bodyRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw serviceError('INVALID_INPUT', '请求参数无效');
  return value as Record<string, unknown>;
}
