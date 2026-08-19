/**
 * 云帆志愿 · 容器启动期数据库结构初始化（schema + auth-schema）。
 *
 * 多副本冷启动时以 PostgreSQL advisory lock 串行化初始化；连接、锁和语句均有限时，
 * 因而初始化失败可被日志明确观测且不会无限阻塞后台进程。
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const PG = {
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD ?? 'postgres',
  database: process.env.PGDATABASE ?? 'yunfan',
};

const MAX_RETRIES = Math.max(1, Number(process.env.PG_INIT_MAX_RETRIES ?? 3));
const RETRY_INTERVAL_MS = Math.max(0, Number(process.env.PG_INIT_RETRY_INTERVAL_MS ?? 3_000));
const CONNECTION_TIMEOUT_MS = Math.max(1_000, Number(process.env.PG_CONNECTION_TIMEOUT_MS ?? 8_000));
const LOCK_TIMEOUT_MS = Math.max(1_000, Number(process.env.PG_INIT_LOCK_TIMEOUT_MS ?? 15_000));
const STATEMENT_TIMEOUT_MS = Math.max(1_000, Number(process.env.PG_INIT_STATEMENT_TIMEOUT_MS ?? 20_000));
const INIT_LOCK_KEY = 2_406_081_801;

function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function describeError(error: unknown): { message: string; code?: string } {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    return { message: error.message, ...(typeof code === 'string' ? { code } : {}) };
  }
  return { message: String(error) };
}

async function applyFile(client: Client, file: string, dbDir: string): Promise<void> {
  const sql = fs.readFileSync(path.join(dbDir, file), 'utf8');
  const statements = splitStatements(sql);
  for (const statement of statements) {
    await client.query(statement);
  }
  console.log(`[云帆][init] 已应用 ${file}（${statements.length} 条语句）`);
}

async function configureClient(client: Client): Promise<void> {
  await client.query(`SET lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);
  await client.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`);
}

async function initialize(client: Client, dbDir: string): Promise<void> {
  await configureClient(client);
  console.log('[云帆][init] 等待数据库初始化锁...');
  await client.query('SELECT pg_advisory_lock($1)', [INIT_LOCK_KEY]);
  try {
    await client.query('BEGIN');
    await applyFile(client, 'schema.sql', dbDir);
    await applyFile(client, 'auth-schema.sql', dbDir);
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Original initialization error is the useful diagnostic.
    }
    throw error;
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [INIT_LOCK_KEY]);
    } catch (error) {
      console.error('[云帆][init] 释放初始化锁失败', describeError(error));
    }
  }
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function run(): Promise<void> {
  const dbDir = path.join(process.cwd(), 'src', 'db');
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const client = new Client({
      ...PG,
      application_name: 'yunfan-db-init',
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      query_timeout: STATEMENT_TIMEOUT_MS,
    });
    try {
      console.log(`[云帆][init] 连接 PG（第 ${attempt}/${MAX_RETRIES} 次）：${PG.user}@${PG.host}:${PG.port}/${PG.database}`);
      await client.connect();
      await initialize(client, dbDir);
      console.log('[云帆][init] 数据库结构就绪 ✓');
      return;
    } catch (error) {
      lastError = error;
      console.error(`[云帆][init] 第 ${attempt}/${MAX_RETRIES} 次失败`, describeError(error));
    } finally {
      try {
        await client.end();
      } catch (error) {
        console.error('[云帆][init] 关闭初始化连接失败', describeError(error));
      }
    }
    if (attempt < MAX_RETRIES) await sleep(RETRY_INTERVAL_MS);
  }
  throw new Error(`数据库结构初始化失败（已重试 ${MAX_RETRIES} 次）：${describeError(lastError).message}`);
}

run().catch((error) => {
  console.error('[云帆][init] 初始化终止', describeError(error));
  process.exit(1);
});
