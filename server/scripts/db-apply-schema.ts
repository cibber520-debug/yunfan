/**
 * 云帆志愿 · 容器启动期数据库结构初始化（schema + auth-schema）
 *
 * 设计目标：
 *   - 在 CloudBase Run 容器启动时自动建表，无需进入容器终端、无需给 PG 开公网。
 *   - schema.sql / auth-schema.sql 全部使用 IF NOT EXISTS / DROP ... IF EXISTS，
 *     可安全重复执行（容器冷启动/缩容重启均幂等）。
 *   - 连接失败会自动重试（默认 8s 超时 × 5 次，间隔 3s），兼容 PG 实例稍晚就绪。
 *
 * 容器内路径：WORKDIR=/app，src 在 /app/src，scripts 在 /app/scripts。
 * 连接信息来自 CloudBase Run 注入的环境变量（与 config.ts 一致）。
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

const MAX_RETRIES = 5;
const RETRY_INTERVAL_MS = 3000;

function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function applyFile(client: Client, file: string, dbDir: string): Promise<void> {
  const sql = fs.readFileSync(path.join(dbDir, file), 'utf8');
  const stmts = splitStatements(sql);
  for (const stmt of stmts) {
    await client.query(stmt);
  }
  console.log(`[云帆][init] 已应用 ${file}（${stmts.length} 条语句）`);
}

async function run(): Promise<void> {
  const dbDir = path.join(process.cwd(), 'src', 'db');
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const client = new Client({ ...PG, connectionTimeoutMillis: 8000 });
    try {
      console.log(
        `[云帆][init] 连接 PG（第 ${attempt}/${MAX_RETRIES} 次）：${PG.user}@${PG.host}:${PG.port}/${PG.database}`,
      );
      await client.connect();
      await applyFile(client, 'schema.sql', dbDir);
      await applyFile(client, 'auth-schema.sql', dbDir);
      await client.end();
      console.log('[云帆][init] 数据库结构就绪 ✓');
      return;
    } catch (err) {
      lastErr = err;
      console.error(`[云帆][init] 第 ${attempt} 次失败：${(err as Error).message}`);
      try {
        await client.end();
      } catch {
        /* ignore */
      }
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
      }
    }
  }
  throw new Error(`数据库结构初始化失败（已重试 ${MAX_RETRIES} 次）：${String(lastErr)}`);
}

run().catch((err) => {
  console.error('[云帆][init]', err.message);
  process.exit(1);
});
