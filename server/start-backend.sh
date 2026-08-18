#!/usr/bin/env bash
# 云帆志愿后端一键启动脚本。
# 用法：在 server 目录执行 ./start-backend.sh；服务以前台开发模式运行，按 Ctrl+C 停止。

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  printf '未检测到 Node.js。请先安装 Node.js 20 或更高版本。\n' >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  printf '未检测到 npm。请确认 Node.js 已正确安装。\n' >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  printf '当前 Node.js 版本为 %s；后端要求 Node.js 20 或更高版本。\n' "$(node -v)" >&2
  exit 1
fi

if [ ! -d "node_modules" ] || [ ! -f "node_modules/tsx/package.json" ]; then
  printf '首次启动，正在按照 package-lock.json 安装后端依赖...\n'
  npm ci
fi

PORT="$(node -e "require('dotenv').config(); process.stdout.write(process.env.PORT || '3001')")"
if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  printf '端口 %s 已被占用。请先停止占用该端口的服务，或修改 server/.env 中的 PORT。\n' "$PORT" >&2
  exit 1
fi

printf '\n正在启动云帆志愿后端：http://127.0.0.1:%s\n' "$PORT"
printf '健康检查地址：http://127.0.0.1:%s/api/v1/health\n' "$PORT"
printf '提示：后端只提供数据接口，不会展示志愿填报页面；页面请运行项目根目录的 ./start-frontend.sh。\n'
printf '按 Ctrl+C 可停止服务。\n\n'

exec npm run dev
