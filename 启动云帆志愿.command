#!/usr/bin/env bash
# macOS 双击启动器：启动前端与后端，并在两者就绪后打开浏览器。
# 可在 Finder 中直接双击本文件；也可在终端运行：./启动云帆志愿.command

set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# Finder 双击 .command 时，PATH 可能不会加载终端配置；补齐本机常见 Node.js / pnpm 安装位置。
for tool_bin in \
  "$HOME/.workbuddy/binaries/node/versions/22.22.2/bin" \
  "$HOME/.local/share/fnm/node-versions/v22.22.2/installation/bin" \
  "/opt/homebrew/bin" \
  "/usr/local/bin"; do
  if [ -d "$tool_bin" ]; then
    export PATH="$tool_bin:$PATH"
  fi
done

RUNTIME_DIR="$PROJECT_DIR/.runtime"
BACKEND_URL="http://127.0.0.1:3001/api/v1/health"
FRONTEND_URL="http://127.0.0.1:5173"
BACKEND_LOG="$RUNTIME_DIR/backend.log"
FRONTEND_LOG="$RUNTIME_DIR/frontend.log"
BACKEND_PID_FILE="$RUNTIME_DIR/backend.pid"
FRONTEND_PID_FILE="$RUNTIME_DIR/frontend.pid"
PG_LOG="$RUNTIME_DIR/postgres.log"

# 定位 Homebrew 安装的 PostgreSQL 数据目录（版本号可能不同，按 postgresql@* 通配）
PG_DATA_DIR=""
for d in /opt/homebrew/var/postgresql@*/ /opt/homebrew/var/postgresql; do
  if [ -d "$d" ]; then PG_DATA_DIR="${d%/}"; break; fi
done

mkdir -p "$RUNTIME_DIR"

is_ready() {
  curl -fsS --max-time 2 "$1" >/dev/null 2>&1
}

port_is_occupied() {
  local port="$1"
  command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

wait_for_service() {
  local url="$1"
  local name="$2"
  local log_file="$3"
  local attempt

  for attempt in $(seq 1 30); do
    if is_ready "$url"; then
      printf '%s 已就绪。\n' "$name"
      return 0
    fi
    sleep 1
  done

  printf '\n%s 启动失败或在 30 秒内未就绪。最近日志如下：\n' "$name" >&2
  tail -n 30 "$log_file" 2>/dev/null || true
  return 1
}

terminate_tree() {
  local pid="$1"
  local child

  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    terminate_tree "$child"
  done
  kill -TERM "$pid" 2>/dev/null || true
}

# PostgreSQL 是否已就绪（后端在 postgres 模式下依赖它）
pg_ready() {
  command -v pg_isready >/dev/null 2>&1 && pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1
}

# 若 PostgreSQL 未运行则尝试启动；已运行则直接复用。不负责停止。
start_postgres() {
  if pg_ready; then
    printf 'PostgreSQL 已在运行，直接复用。\n'
    return 0
  fi

  if [ -z "$PG_DATA_DIR" ] || [ ! -d "$PG_DATA_DIR" ]; then
    printf '未找到 PostgreSQL 数据目录，请确认已通过 Homebrew 安装 postgresql。\n' >&2
    printf '可运行：brew install postgresql && brew services start postgresql\n' >&2
    return 1
  fi

  printf '正在启动 PostgreSQL…\n'
  if ! pg_ctl -D "$PG_DATA_DIR" -l "$PG_LOG" start >/dev/null 2>&1; then
    printf 'PostgreSQL 启动失败，请查看日志：%s\n' "$PG_LOG" >&2
    return 1
  fi

  for _ in $(seq 1 30); do
    if pg_ready; then
      printf 'PostgreSQL 已就绪。\n'
      return 0
    fi
    sleep 1
  done
  printf 'PostgreSQL 在 30 秒内未就绪。\n' >&2
  return 1
}

start_service() {
  local name="$1"
  local script="$2"
  local url="$3"
  local port="$4"
  local log_file="$5"
  local pid_file="$6"
  local pid
  local existing_pid

  if is_ready "$url"; then
    # 已运行的服务直接复用，不会重复启动。保留仍有效的启动器 PID，方便稍后安全停止。
    if [ -f "$pid_file" ]; then
      existing_pid="$(tr -d '[:space:]' < "$pid_file")"
      if [ -z "$existing_pid" ] || ! [[ "$existing_pid" =~ ^[0-9]+$ ]] || ! kill -0 "$existing_pid" 2>/dev/null; then
        rm -f "$pid_file"
      fi
    fi
    printf '%s 已在运行，直接复用。\n' "$name"
    return 0
  fi

  if port_is_occupied "$port"; then
    printf '%s 需要的端口 %s 已被其他服务占用，未自动终止该服务。\n' "$name" "$port" >&2
    printf '请先关闭占用端口的程序，再双击此启动器重试。\n' >&2
    return 1
  fi

  printf '正在启动%s…\n' "$name"
  nohup /bin/bash "$script" >"$log_file" 2>&1 < /dev/null &
  pid="$!"
  printf '%s\n' "$pid" > "$pid_file"

  if ! wait_for_service "$url" "$name" "$log_file"; then
    terminate_tree "$pid"
    rm -f "$pid_file"
    return 1
  fi
}

printf '\n========== 云帆志愿启动器 ==========\n'
printf '项目目录：%s\n\n' "$PROJECT_DIR"

# 后端以 PostgreSQL 模式运行；首次加入认证功能时先补齐增量认证表。
start_postgres || {
  printf 'PostgreSQL 未能启动，后端将无法连接数据库。\n' >&2
}
if pg_ready; then
  if command -v psql >/dev/null 2>&1; then
    PGPASSWORD="postgres" psql -h 127.0.0.1 -p 5432 -U postgres -d yunfan -v ON_ERROR_STOP=1 -f "$PROJECT_DIR/server/src/db/auth-schema.sql" >/dev/null
    printf '认证数据表已就绪。\n'
  else
    printf '未找到 psql，跳过认证数据表检查；请手动执行 server/src/db/auth-schema.sql。\n' >&2
  fi
fi

start_service "后端服务" "$PROJECT_DIR/server/start-backend.sh" "$BACKEND_URL" "3001" "$BACKEND_LOG" "$BACKEND_PID_FILE"
start_service "前端页面" "$PROJECT_DIR/start-frontend.sh" "$FRONTEND_URL" "5173" "$FRONTEND_LOG" "$FRONTEND_PID_FILE"

printf '\n启动完成。正在打开页面：%s\n' "$FRONTEND_URL"
printf '后端健康检查：%s\n' "$BACKEND_URL"
printf '运行日志目录：%s\n' "$RUNTIME_DIR"
printf '如需停止本启动器创建的服务，请双击“停止云帆志愿.command”。\n'

if [ "${NO_BROWSER:-0}" != "1" ]; then
  open "$FRONTEND_URL"
fi
