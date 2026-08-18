#!/bin/sh
# 云帆志愿后端启动入口
# 顺序：应用数据库结构（schema + auth-schema）→ 写入种子数据 → 启动 HTTP 服务
# 说明：数据库初始化失败不会阻断服务启动（/api/v1/health 不查库，仍为绿），
#       便于在 CloudBase Run「日志」中看到初始化报错并排障。
set -e

echo "[云帆] ① 应用数据库结构（schema + auth-schema）..."
npx tsx scripts/db-apply-schema.ts || echo "[云帆] 数据库结构应用失败，详见上方日志；继续启动服务。"

echo "[云帆] ② 写入种子数据..."
npx tsx scripts/seed-db.ts || echo "[云帆] 种子数据写入失败，详见上方日志；继续启动服务。"

echo "[云帆] ③ 启动后端服务..."
exec npx tsx src/index.ts
