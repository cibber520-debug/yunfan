import dotenv from 'dotenv';

dotenv.config();

export type DataSourceKind = 'seed' | 'postgres';

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw.trim().toLowerCase() !== 'false' && raw.trim() !== '0';
}

const dataSourceRaw = (process.env.DATA_SOURCE ?? 'seed').toLowerCase();
const apiKey = process.env.DEEPSEEK_API_KEY ?? '';
export const config = {
  port: intEnv('PORT', 3001),
  host: process.env.HOST ?? '0.0.0.0',
  trustProxy: Math.max(0, intEnv('TRUST_PROXY', 0)),
  nodeEnv: (process.env.NODE_ENV ?? 'development').toLowerCase(),
  logLevel: (process.env.LOG_LEVEL ?? ((process.env.NODE_ENV ?? 'development').toLowerCase() === 'production' ? 'info' : 'debug')),
  dataSource: (dataSourceRaw === 'postgres' ? 'postgres' : 'seed') as DataSourceKind,
  seedVersion: process.env.SEED_VERSION ?? '2026.08-demo',
  corsOrigins: (process.env.CORS_ORIGIN ?? (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:5173,http://localhost:5173'))
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0),
  llm: {
    enabled: boolEnv('USE_LLM', true) && apiKey.length > 0,
    apiKey,
    baseUrl: process.env.LLM_BASE_URL ?? 'https://api.deepseek.com',
    model: process.env.LLM_MODEL ?? 'deepseek-v4-flash',
    timeoutMs: intEnv('LLM_TIMEOUT_MS', 60000),
  },
  db: {
    host: process.env.PGHOST ?? '127.0.0.1',
    port: intEnv('PGPORT', 5432),
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? 'postgres',
    database: process.env.PGDATABASE ?? 'yunfan',
    max: intEnv('PG_POOL_MAX', 10),
  },
  auth: {
    sessionCookieName: process.env.AUTH_SESSION_COOKIE_NAME ?? 'yunfan_session',
    cookieSameSite: process.env.AUTH_COOKIE_SAME_SITE === 'none' ? 'none' as const : 'lax' as const,
    sessionSecret: process.env.AUTH_SESSION_SECRET ?? '',
    codePepper: process.env.AUTH_CODE_PEPPER ?? '',
    sessionDays: Math.max(1, intEnv('AUTH_SESSION_DAYS', 30)),
    codeTtlSeconds: Math.max(60, intEnv('AUTH_CODE_TTL_SECONDS', 300)),
    codeResendSeconds: Math.max(30, intEnv('AUTH_CODE_RESEND_SECONDS', 60)),
    codeMaxAttempts: Math.max(1, intEnv('AUTH_CODE_MAX_ATTEMPTS', 5)),
    maxCodesPerIpHour: Math.max(1, intEnv('AUTH_MAX_CODES_PER_IP_HOUR', 20)),
  },
  mail: {
    transport: process.env.MAIL_TRANSPORT === 'smtp' ? 'smtp' as const : 'console' as const,
    smtpHost: process.env.SMTP_HOST ?? 'smtp.qq.com',
    smtpPort: intEnv('SMTP_PORT', 465),
    smtpSecure: boolEnv('SMTP_SECURE', true),
    smtpUser: process.env.SMTP_USER ?? '',
    smtpPass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? '',
  },
  sms: {
    transport: process.env.SMS_TRANSPORT === 'provider' ? 'provider' as const : 'console' as const,
    provider: process.env.SMS_PROVIDER ?? 'aliyun',
    accessKeyId: process.env.SMS_ACCESS_KEY_ID ?? '',
    accessKeySecret: process.env.SMS_ACCESS_KEY_SECRET ?? '',
    signName: process.env.SMS_SIGN_NAME ?? '',
    templateCode: process.env.SMS_TEMPLATE_CODE ?? '',
  },
};

export const isProduction = config.nodeEnv === 'production';
