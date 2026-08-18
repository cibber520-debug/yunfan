#!/usr/bin/env node
/**
 * 云帆志愿 · 公网初始化 PostgreSQL（schema + seed）
 *
 * 用途：当无法从 Cloud Run 容器内部直连 PG 时（Cloud Run 无 Web 终端），
 *       从本机通过 PG 的公网地址完成建表与种子数据写入。无需安装 psql。
 *
 * 用法（项目根目录）：
 *   PGHOST=<公网地址> PGPORT=5432 PGUSER=yunfan \
 *   PGPASSWORD='Yunfan?*123456' PGDATABASE=yunfan \
 *   npx tsx deploy/init-public.mts
 *
 * 前置：PostgreSQL 控制台已开启「公网地址」，并把本机公网 IP 加入白名单。
 */

import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const required = ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('缺少环境变量：', missing.join(', '));
  process.exit(1);
}

const root = process.cwd();
console.log(
  `==> connecting to ${process.env.PGUSER}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`,
);

async function applySchemas() {
  const c = new Client();
  await c.connect();
  const dbDir = path.join(root, 'server', 'src', 'db');
  for (const file of ['schema.sql', 'auth-schema.sql']) {
    const sql = fs.readFileSync(path.join(dbDir, file), 'utf8');
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
      await c.query(stmt);
    }
    console.log('==> applied', file);
  }
  await c.end();
  console.log('==> schema done');
}

async function main() {
  await applySchemas();
  // 动态导入 seed-db.ts（其顶层会调用 main() 跑种子，复用环境变量）
  const seedPath = path.join(root, 'server', 'scripts', 'seed-db.ts');
  await import(seedPath);
}

main().catch((err) => {
  console.error('初始化失败：', err);
  process.exit(1);
});