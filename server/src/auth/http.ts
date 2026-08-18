import type { Request, Response } from 'express';
import { config, isProduction } from '../config';

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (header === undefined) return undefined;
  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === name) return decodeURIComponent(rawValue.join('='));
  }
  return undefined;
}

export function readSessionToken(request: Request): string | undefined {
  return readCookie(request, config.auth.sessionCookieName);
}

export function setSessionCookie(response: Response, token: string): void {
  const sameSite = config.auth.cookieSameSite;
  response.cookie(config.auth.sessionCookieName, token, {
    httpOnly: true,
    secure: isProduction || sameSite === 'none',
    sameSite,
    path: '/',
    maxAge: config.auth.sessionDays * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(response: Response): void {
  const sameSite = config.auth.cookieSameSite;
  response.clearCookie(config.auth.sessionCookieName, {
    httpOnly: true,
    secure: isProduction || sameSite === 'none',
    sameSite,
    path: '/',
  });
}
