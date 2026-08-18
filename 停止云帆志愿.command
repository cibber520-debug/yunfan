#!/usr/bin/env bash
# macOS 双击停止器：只停止“启动云帆志愿.command”本次创建并记录的服务。
# 不会终止由用户手动启动或其他程序占用的服务。

set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$PROJECT_DIR/.runtime"

terminate_tree() {
  local pid="$1"
  local child

  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    terminate_tree "$child"
  done
  kill -TERM "$pid" 2>/dev/null || true
}

stop_recorded_service() {
  local name="$1"
  local pid_file="$2"
  local pid

  if [ ! -f "$pid_file" ]; then
    printf '%s：没有找到本启动器创建的进程记录，已跳过。\n' "$name"
    return 0
  fi

  pid="$(tr -d '[:space:]' < "$pid_file")"
  if [ -z "$pid" ] || ! [[ "$pid" =~ ^[0-9]+$ ]]; then
    printf '%s：进程记录无效，已清理。\n' "$name"
    rm -f "$pid_file"
    return 0
  fi

  if kill -0 "$pid" 2>/dev/null; then
    printf '正在停止%s…\n' "$name"
    terminate_tree "$pid"
    sleep 1
    printf '%s 已停止。\n' "$name"
  else
    printf '%s 已不在运行，已清理记录。\n' "$name"
  fi
  rm -f "$pid_file"
}

printf '\n========== 云帆志愿停止器 ==========\n'
stop_recorded_service "前端页面" "$RUNTIME_DIR/frontend.pid"
stop_recorded_service "后端服务" "$RUNTIME_DIR/backend.pid"
printf '操作完成。\n'
