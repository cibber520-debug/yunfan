#!/bin/sh
# 云帆志愿后端启动入口
# 关键改动：服务先启动（让 CloudBase Run 健康检查秒过），
#           数据库初始化（schema + seed）放到后台异步跑。
# 这样即使 PG 暂时连不上/初始化慢，pod 也能进入 Running 状态，
# 业务接口在初始化完成前会返回 DB 错误，但服务不会被反复重启。
set -e

echo "[云帆] 后台启动数据库初始化（schema + seed）..."
(
  echo "[云帆][init] 应用数据库结构..."
  npx tsx scripts/db-apply-schema.ts || echo "[云帆][init] 数据库结构应用失败，详见上方日志"
  echo "[云帆][init] 写入种子数据..."
  npx tsx scripts/seed-db.ts || echo "[云帆][init] 种子数据写入失败，详见上方日志"
  echo "[云帆][init] 数据库初始化流程结束"
) &

echo "[云帆] 启动后端服务..."
exec npx tsx src/index.ts