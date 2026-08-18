import { Router } from 'express';
import { asyncHandler } from '../http/asyncHandler';
import { serviceError } from '../errors';
import { clearSessionCookie, readSessionToken, setSessionCookie } from '../auth/http';
import type { AuthenticatedRequest } from '../auth/types';
import type { AuthService } from '../auth/authService';
import type { SessionService } from '../auth/sessionService';

export function createAuthRouter(auth: AuthService, sessions: SessionService): Router {
  const router = Router();

  router.post('/auth/send-code', asyncHandler(async (req, res) => {
    const body = bodyRecord(req.body);
    const channel = parseChannel(body.channel);
    const purpose = parsePurpose(body.purpose);
    const contact = channel === 'EMAIL' ? body.email : body.phone;
    const result = await auth.sendCode(contact, channel, purpose, req.ip);
    const message = channel === 'EMAIL' ? '验证码已发送，请查收邮箱' : '验证码已发送，请查收手机短信';
    res.status(202).json({ ...result, message });
  }));

  router.post('/auth/register', asyncHandler(async (req, res) => {
    const body = bodyRecord(req.body);
    const channel = parseChannel(body.channel);
    const contact = channel === 'EMAIL' ? body.email : body.phone;
    const result = await auth.register(contact, channel, body.code, body.displayName);
    setSessionCookie(res, result.sessionToken);
    res.status(201).json({ user: result.user });
  }));

  router.post('/auth/login', asyncHandler(async (req, res) => {
    const body = bodyRecord(req.body);
    const channel = parseChannel(body.channel);
    const contact = channel === 'EMAIL' ? body.email : body.phone;
    const result = await auth.login(contact, channel, body.code);
    setSessionCookie(res, result.sessionToken);
    res.json({ user: result.user });
  }));

  router.post('/auth/logout', asyncHandler(async (req, res) => {
    await sessions.revoke(readSessionToken(req));
    clearSessionCookie(res);
    res.status(204).end();
  }));

  router.get('/auth/me', requireUser(sessions), asyncHandler(async (req: AuthenticatedRequest, res) => {
    res.json({ user: req.authUser });
  }));

  return router;
}

export function requireUser(sessions: SessionService) {
  return asyncHandler(async (req: AuthenticatedRequest, _res, next) => {
    const user = await sessions.resolve(readSessionToken(req));
    if (user === null) throw serviceError('UNAUTHORIZED', '请先登录');
    req.authUser = user;
    next();
  });
}

function bodyRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw serviceError('INVALID_INPUT', '请求参数无效');
  return value as Record<string, unknown>;
}

function parsePurpose(value: unknown): 'REGISTER' | 'LOGIN' {
  if (value === 'REGISTER' || value === 'LOGIN') return value;
  throw serviceError('INVALID_INPUT', '验证码用途无效', 'purpose');
}

function parseChannel(value: unknown): 'EMAIL' | 'SMS' {
  if (value === 'EMAIL' || value === 'SMS') return value;
  throw serviceError('INVALID_INPUT', '验证码发送渠道无效', 'channel');
}
