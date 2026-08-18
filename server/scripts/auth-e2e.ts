import { strict as assert } from 'node:assert';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db/pool';

type JsonObject = Record<string, unknown>;

const origin = 'http://127.0.0.1:5173';
const testIp = `198.18.${randomInt(1, 255)}.${randomInt(1, 255)}`;
const primaryIp = `198.19.${randomInt(1, 255)}.${randomInt(1, 255)}`;
const expiredIp = `198.20.${randomInt(1, 255)}.${randomInt(1, 255)}`;
const attemptsIp = `198.21.${randomInt(1, 255)}.${randomInt(1, 255)}`;
const email = `auth-e2e-${randomUUID().slice(0, 12)}@example.com`;
const expiredEmail = `auth-expired-${randomUUID().slice(0, 12)}@example.com`;
const attemptsEmail = `auth-attempts-${randomUUID().slice(0, 12)}@example.com`;
const rateLimitFirstEmail = `auth-rate-a-${randomUUID().slice(0, 12)}@example.com`;
const rateLimitSecondEmail = `auth-rate-b-${randomUUID().slice(0, 12)}@example.com`;
const testEmails = [email, expiredEmail, attemptsEmail, rateLimitFirstEmail, rateLimitSecondEmail];
const smsRegisterIp = `198.22.${randomInt(1, 255)}.${randomInt(1, 255)}`;
const smsLoginIp = `198.23.${randomInt(1, 255)}.${randomInt(1, 255)}`;
const smsConflictIp = `198.24.${randomInt(1, 255)}.${randomInt(1, 255)}`;
const smsNotFoundIp = `198.25.${randomInt(1, 255)}.${randomInt(1, 255)}`;
const smsPhone = `138${randomInt(10000000, 99999999).toString().padStart(8, '0')}`;
const smsUnknownPhone = `139${randomInt(10000000, 99999999).toString().padStart(8, '0')}`;
const testPhones = [smsPhone, smsUnknownPhone];
const draft: JsonObject = {
  basic: {
    province: '广东', examType: 'NEW_312', subjects: ['物理'], totalScore: 600,
    provinceRank: 10000, rankSegment: null, identities: ['NONE'], bonusScore: null,
  },
  preferences: {
    schoolTiers: ['211'], ownership: 'ALL', preferredRegions: ['广东'], rejectedRegions: [],
    majorCategories: ['计算机'], preferredMajors: [], blacklistedMajors: [],
  },
  weights: { school: 34, major: 33, region: 33 },
};

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address !== null && typeof address !== 'string');
  await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  return address.port;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(getValue: () => T | null | Promise<T | null>, message: string): Promise<T> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const value = await getValue();
    if (value !== null) return value;
    await delay(50);
  }
  throw new Error(message);
}

async function stop(child: ChildProcess | undefined): Promise<void> {
  if (child === undefined || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise<void>((resolve) => child.once('exit', () => resolve())), delay(5_000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function cookieFrom(response: Response): string {
  const header = response.headers.get('set-cookie');
  assert(header !== null, '认证响应未写入会话 Cookie');
  return header.split(';', 1)[0] ?? '';
}

async function main(): Promise<void> {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  const logs: { value: string } = { value: '' };
  const tsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
  const child = spawn(process.execPath, [tsx, 'src/index.ts'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      PORT: String(port), HOST: '127.0.0.1', DATA_SOURCE: 'postgres', USE_LLM: 'false',
      MAIL_TRANSPORT: 'console', CORS_ORIGIN: origin, TRUST_PROXY: '1',
      AUTH_MAX_CODES_PER_IP_HOUR: '1',
      AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET || randomUUID(),
      AUTH_CODE_PEPPER: process.env.AUTH_CODE_PEPPER || randomUUID(),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => { logs.value += chunk; });
  child.stderr?.on('data', (chunk: string) => { logs.value += chunk; });

  async function request(path: string, init: RequestInit = {}, cookie?: string): Promise<{ response: Response; body: JsonObject | null }> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', Origin: origin, ...(cookie === undefined ? {} : { Cookie: cookie }), ...init.headers },
    });
    const raw = await response.text();
    return { response, body: raw === '' ? null : JSON.parse(raw) as JsonObject };
  }

  function codeFor(targetEmail: string, purpose: 'REGISTER' | 'LOGIN'): string | null {
    const marker = `[mail:console] ${purpose} verification to ${targetEmail}: `;
    const line = logs.value.split('\n').reverse().find((item) => item.includes(marker));
    return line === undefined ? null : line.slice(line.indexOf(marker) + marker.length).trim();
  }

  function smsCodeFor(targetPhone: string, purpose: 'REGISTER' | 'LOGIN'): string | null {
    const marker = `[sms:console] ${purpose} verification to ${targetPhone}: `;
    const line = logs.value.split('\n').reverse().find((item) => item.includes(marker));
    return line === undefined ? null : line.slice(line.indexOf(marker) + marker.length).trim();
  }

  try {
    await waitFor(async () => {
      try {
        return (await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1_000) })).ok ? true : null;
      } catch {
        return null;
      }
    }, '认证测试后端未能启动');

    let result = await request('/profile');
    assert.equal(result.response.status, 401);
    assert.equal(result.body?.code, 'UNAUTHORIZED');

    result = await request('/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': primaryIp }, body: JSON.stringify({ channel: 'EMAIL', email, purpose: 'REGISTER' }) });
    assert.equal(result.response.status, 202);
    assert.equal(result.response.headers.get('access-control-allow-origin'), origin);
    assert.equal(result.response.headers.get('access-control-allow-credentials'), 'true');
    const registerCode = await waitFor(() => codeFor(email, 'REGISTER'), '未捕获注册验证码');

    result = await request('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'EMAIL', email, code: registerCode === '000000' ? '111111' : '000000', displayName: '认证回归测试' }) });
    assert.equal(result.response.status, 400);
    result = await request('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'EMAIL', email, code: registerCode, displayName: '认证回归测试' }) });
    assert.equal(result.response.status, 201);
    const registerCookie = cookieFrom(result.response);

    result = await request('/auth/me', {}, registerCookie);
    assert.equal(result.response.status, 200);
    assert.equal((result.body?.user as JsonObject).email, email);
    result = await request('/profile', {}, registerCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.body?.profile, null);

    const profile = { draft, completedStep: 3, selectedVolunteerIds: ['e2e-volunteer-a', 'e2e-volunteer-b'] };
    result = await request('/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) }, registerCookie);
    assert.equal(result.response.status, 200);
    const savedProfile = result.body?.profile as JsonObject;
    assert.deepEqual(savedProfile.draft, draft);
    assert.equal(savedProfile.completedStep, 3);
    assert.deepEqual(savedProfile.selectedVolunteerIds, profile.selectedVolunteerIds);

    result = await request('/auth/logout', { method: 'POST' }, registerCookie);
    assert.equal(result.response.status, 204);
    result = await request('/profile', {}, registerCookie);
    assert.equal(result.response.status, 401);

    result = await request('/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.2' }, body: JSON.stringify({ channel: 'EMAIL', email, purpose: 'LOGIN' }) });
    assert.equal(result.response.status, 202);
    const loginCode = await waitFor(() => codeFor(email, 'LOGIN'), '未捕获登录验证码');
    result = await request('/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.2' }, body: JSON.stringify({ channel: 'EMAIL', email, purpose: 'LOGIN' }) });
    assert.equal(result.response.status, 429, `登录验证码重发限制异常：${JSON.stringify(result.body)}`);
    result = await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'EMAIL', email, code: loginCode }) });
    assert.equal(result.response.status, 200);
    const loginCookie = cookieFrom(result.response);
    result = await request('/profile', {}, loginCookie);
    assert.equal(result.response.status, 200);
    const restoredProfile = result.body?.profile as JsonObject;
    assert.deepEqual(restoredProfile.draft, draft);
    assert.equal(restoredProfile.completedStep, 3);
    assert.deepEqual(restoredProfile.selectedVolunteerIds, profile.selectedVolunteerIds);

    await pool.query(
      `UPDATE email_verification_code
          SET request_ip = NULL
        WHERE email = $1`,
      [email],
    );

    result = await request('/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': expiredIp }, body: JSON.stringify({ channel: 'EMAIL', email: expiredEmail, purpose: 'REGISTER' }) });
    assert.equal(result.response.status, 202);
    await pool.query(
      `UPDATE email_verification_code
          SET expires_at = now() - interval '1 second'
        WHERE email = $1 AND purpose = 'REGISTER'`,
      [expiredEmail],
    );
    result = await request('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'EMAIL', email: expiredEmail, code: '123456', displayName: '过期测试' }) });
    assert.equal(result.response.status, 400, `过期验证码响应异常：${JSON.stringify(result.body)}`);
    assert.equal(result.body?.code, 'INVALID_INPUT');

    await pool.query(
      `UPDATE email_verification_code
          SET request_ip = NULL
        WHERE email = $1`,
      [expiredEmail],
    );

    result = await request('/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': attemptsIp }, body: JSON.stringify({ channel: 'EMAIL', email: attemptsEmail, purpose: 'REGISTER' }) });
    assert.equal(result.response.status, 202, `尝试上限验证码请求异常：${JSON.stringify(result.body)}；测试 IP：${attemptsIp}`);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      result = await request('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'EMAIL', email: attemptsEmail, code: '000000', displayName: '尝试测试' }) });
      assert.equal(result.response.status, 400);
      assert.equal(result.body?.code, 'INVALID_INPUT');
    }
    result = await request('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'EMAIL', email: attemptsEmail, code: '000000', displayName: '尝试测试' }) });
    assert.equal(result.response.status, 429);
    assert.equal(result.body?.code, 'TOO_MANY_REQUESTS');

    result = await request('/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': testIp },
      body: JSON.stringify({ channel: 'EMAIL', email: rateLimitFirstEmail, purpose: 'REGISTER' }),
    });
    assert.equal(result.response.status, 202);
    result = await request('/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': testIp },
      body: JSON.stringify({ channel: 'EMAIL', email: rateLimitSecondEmail, purpose: 'REGISTER' }),
    });
    assert.equal(result.response.status, 429, `IP 限流响应异常：${JSON.stringify(result.body)}；测试 IP：${testIp}`);
    assert.equal(result.body?.code, 'TOO_MANY_REQUESTS');

    // 手机验证码通道（开发模式 console 打印验证码）
    result = await request('/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': smsRegisterIp }, body: JSON.stringify({ channel: 'SMS', phone: smsPhone, purpose: 'REGISTER' }) });
    assert.equal(result.response.status, 202);
    assert.equal(result.response.headers.get('access-control-allow-credentials'), 'true');
    const smsRegisterCode = await waitFor(() => smsCodeFor(smsPhone, 'REGISTER'), '未捕获手机注册验证码');
    result = await request('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'SMS', phone: smsPhone, code: smsRegisterCode, displayName: '手机注册测试' }) });
    assert.equal(result.response.status, 201, `手机注册响应异常：${JSON.stringify(result.body)}`);
    const smsRegisterCookie = cookieFrom(result.response);
    result = await request('/auth/me', {}, smsRegisterCookie);
    assert.equal(result.response.status, 200);
    assert.equal((result.body?.user as JsonObject).phone, smsPhone);

    const smsProfile = { draft, completedStep: 2, selectedVolunteerIds: ['e2e-sms-volunteer'] };
    result = await request('/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(smsProfile) }, smsRegisterCookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.body?.profile === null ? -1 : (result.body?.profile as JsonObject).completedStep, 2);

    result = await request('/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': smsLoginIp }, body: JSON.stringify({ channel: 'SMS', phone: smsPhone, purpose: 'LOGIN' }) });
    assert.equal(result.response.status, 202, `手机登录验证码请求异常：${JSON.stringify(result.body)}`);
    const smsLoginCode = await waitFor(() => smsCodeFor(smsPhone, 'LOGIN'), '未捕获手机登录验证码');
    result = await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'SMS', phone: smsPhone, code: smsLoginCode }) });
    assert.equal(result.response.status, 200, `手机登录响应异常：${JSON.stringify(result.body)}`);
    const smsLoginCookie = cookieFrom(result.response);
    result = await request('/profile', {}, smsLoginCookie);
    assert.equal(result.response.status, 200);
    assert.deepEqual((result.body?.profile as JsonObject).selectedVolunteerIds, smsProfile.selectedVolunteerIds);

    // 已注册手机号再次注册应冲突（409）
    result = await request('/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': smsConflictIp }, body: JSON.stringify({ channel: 'SMS', phone: smsPhone, purpose: 'REGISTER' }) });
    assert.equal(result.response.status, 409, `手机重复注册冲突响应异常：${JSON.stringify(result.body)}`);
    assert.equal(result.body?.code, 'CONFLICT');

    // 未注册手机号请求登录验证码应 404
    result = await request('/auth/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': smsNotFoundIp }, body: JSON.stringify({ channel: 'SMS', phone: smsUnknownPhone, purpose: 'LOGIN' }) });
    assert.equal(result.response.status, 404, `手机未注册登录响应异常：${JSON.stringify(result.body)}`);
    assert.equal(result.body?.code, 'NOT_FOUND');

    console.log('认证端到端回归测试通过：邮箱/手机双通道、CORS、注册/登录、会话、资料保存恢复、过期验证码、尝试上限、重发冷却与 IP 限流均正常。');
  } finally {
    await stop(child);
    await pool.query('DELETE FROM email_verification_code WHERE email = ANY($1::text[])', [testEmails]);
    await pool.query('DELETE FROM email_verification_code WHERE phone = ANY($1::text[])', [testPhones]);
    await pool.query('DELETE FROM app_user WHERE email = ANY($1::text[])', [testEmails]);
    await pool.query('DELETE FROM app_user WHERE phone = ANY($1::text[])', [testPhones]);
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error('认证端到端回归测试失败：', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
