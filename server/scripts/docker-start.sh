#!/bin/sh
# 云帆志愿后端启动入口。
# 服务始终先监听健康检查；PostgreSQL 初始化只在 postgres 数据源时异步执行。
set -eu

data_source="$(printf '%s' "${DATA_SOURCE:-seed}" | tr '[:upper:]' '[:lower:]')"
if [ "$data_source" = "postgres" ]; then
  echo "[云帆][init] 后台启动 PostgreSQL 初始化（schema + seed）..."
  (
    if npx tsx scripts/db-apply-schema.ts; then
      echo "[云帆][init] 数据库结构已就绪，开始写入种子数据..."
      npx tsx scripts/seed-db.ts
      echo "[云帆][init] PostgreSQL 初始化完成"
    else
      echo "[云帆][init] 数据库结构初始化失败，已跳过种子写入；业务请求将返回受控数据库错误" >&2
    fi
  ) &
else
  echo "[云帆][init] DATA_SOURCE=${DATA_SOURCE:-seed}，跳过 PostgreSQL 初始化"
fi

echo "[云帆] 启动后端服务..."
exec npx tsx src/index.ts