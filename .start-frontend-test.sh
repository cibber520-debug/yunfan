#!/usr/bin/env bash
# 云帆志愿前端一键启动脚本。
# 用法：在项目根目录执行 ./start-frontend.sh；服务以前台开发模式运行，按 Ctrl+C 停止。

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  printf '未检测到 Node.js。请先安装 Node.js 20 或更高版本。\n' >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  printf '未检测到 pnpm。请先安装 pnpm 9 或更高版本。\n' >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  printf '当前 Node.js 版本为 %s；前端要求 Node.js 20 或更高版本。\n' "$(node -v)" >&2
  exit 1
fi

if [ ! -d "node_modules" ]; then
  printf '首次启动，正在按照 pnpm-lock.yaml 安装前端依赖...\n'
  pnpm install --frozen-lockfile
fi

PORT=5180
if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  printf '端口 %s 已被占用。请先停止占用该端口的服务，或使用 pnpm dev -- --port <端口> 另行启动。\n' "$PORT" >&2
  exit 1
fi

printf '\n正在启动云帆志愿前端：http://localhost:%s\n' "$PORT"
printf '提示：请先在另一个终端启动后端：cd server && ./start-backend.sh\n'
printf '当前前端已配置为请求 http://localhost:3001 的真实后端数据。\n'
printf '按 Ctrl+C 可停止服务。\n\n'

exec pnpm dev --host 127.0.0.1 --port "$PORT"
