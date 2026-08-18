#!/usr/bin/env bash
# ============================================================
# 云帆志愿 · PostgreSQL 初始化助手（本地或云 PG 均可）
# ============================================================
# 按顺序执行：
#   1) server/src/db/schema.sql      （业务表，幂等）
#   2) server/src/db/auth-schema.sql （认证表，幂等）
#   3) npm run db:seed               （写入种子数据，幂等，可重复运行）
#
# 用法示例（指向本地 docker-compose 的 db 容器）：
#   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=yunfan PGPASSWORD=yunfan PGDATABASE=yunfan \
#     bash deploy/init-db.sh
# 用法示例（指向云 PostgreSQL）：
#   PGHOST=<云PG地址> PGPORT=5432 PGUSER=<账号> PGPASSWORD=<密码> PGDATABASE=yunfan \
#     bash deploy/init-db.sh
#
# 要求：本地已安装 psql 与 node/npm（用于执行 seed）。
# ============================================================

set -euo pipefail

# 定位项目根（deploy/ 的上一级）
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# 必填环境变量校验
: "${PGHOST:?缺少环境变量 PGHOST}"
: "${PGPORT:?缺少环境变量 PGPORT}"
: "${PGUSER:?缺少环境变量 PGUSER}"
: "${PGPASSWORD:?缺少环境变量 PGPASSWORD}"
: "${PGDATABASE:?缺少环境变量 PGDATABASE}"

export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
PGOPTS=(-v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE")

echo "==> [1/3] 执行业务表 server/src/db/schema.sql"
psql "${PGOPTS[@]}" -f server/src/db/schema.sql

echo "==> [2/3] 执行认证表 server/src/db/auth-schema.sql"
psql "${PGOPTS[@]}" -f server/src/db/auth-schema.sql

echo "==> [3/3] 写入种子数据 (npm run db:seed)"
# 种子脚本依赖 tsx（devDependency），确保 server 依赖已安装
if [ ! -d server/node_modules ]; then
  echo "    server/node_modules 不存在，正在安装依赖（含 tsx）…"
  ( cd server && npm ci )
fi
( cd server && npm run db:seed )

echo "✅ 数据库初始化完成：$PGDATABASE @ $PGHOST:$PGPORT"
