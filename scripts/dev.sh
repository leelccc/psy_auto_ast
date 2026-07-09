#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$ROOT_DIR/.dev"
LOG_DIR="$STATE_DIR/logs"
BACKEND_PID_FILE="$STATE_DIR/backend.pid"
FRONTEND_PID_FILE="$STATE_DIR/frontend.pid"
ROOT_ENV="$ROOT_DIR/.env"
BACKEND_ENV="$ROOT_DIR/backend/.env"
DRY_RUN="${DRY_RUN:-0}"

BACKEND_PORT="${BACKEND_PORT:-8000}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
POSTGRES_PORT="${POSTGRES_PORT:-55432}"
MINIO_HOST="${MINIO_HOST:-127.0.0.1}"
MINIO_API_PORT="${MINIO_API_PORT:-59000}"
EXPO_PUBLIC_API_BASE_URL="${EXPO_PUBLIC_API_BASE_URL:-http://127.0.0.1:${BACKEND_PORT}/api/v1}"

usage() {
  cat <<'USAGE'
Usage:
  scripts/dev.sh start      Start dependency services, backend, and frontend
  scripts/dev.sh stop       Stop backend, frontend, and dependency services
  scripts/dev.sh restart    Stop then start everything
  scripts/dev.sh status     Show process and dependency status
  scripts/dev.sh logs       Tail backend and frontend logs
  scripts/dev.sh help       Show this help

Environment flags:
  SKIP_DEPS=1       Do not start/stop Docker Compose services
  SKIP_BACKEND=1    Do not start/stop the FastAPI backend
  SKIP_FRONTEND=1   Do not start/stop the Expo frontend
  KEEP_DEPS=1       Keep Docker Compose services running during stop
  WITH_VOLUMES=1    Use docker compose down -v during stop
  DRY_RUN=1         Print commands without executing them

Useful overrides:
  BACKEND_PORT=8000
  EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1
USAGE
}

log() {
  printf '[dev] %s\n' "$*"
}

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '+'
    local arg
    for arg in "$@"; do
      printf ' %q' "$arg"
    done
    printf '\n'
  else
    "$@"
  fi
}

run_shell() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '+ %s\n' "$*"
  else
    bash -lc "$*"
  fi
}

ensure_dirs() {
  if [[ "$DRY_RUN" == "1" ]]; then
    return
  fi
  mkdir -p "$STATE_DIR" "$LOG_DIR"
}

load_root_env() {
  # 根目录 .env 是配置模板（占位符），不能 export 到子进程，
  # 否则会污染 backend 的进程环境，挡住 pydantic-settings 读取 backend/.env。
  # 这里只把 docker compose 真正需要的几个变量塞进当前 shell 即可。
  if [[ -f "$ROOT_ENV" ]]; then
    while IFS='=' read -r key value; do
      case "$key" in
        ''|\#*) continue ;;
      esac
      # 去掉可能存在的引号
      value="${value%\"}"; value="${value#\"}"
      value="${value%\'}"; value="${value#\'}"
      case "$key" in
        POSTGRES_DB|POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_PORT|\
        MINIO_ROOT_USER|MINIO_ROOT_PASSWORD|\
        MINIO_API_PORT|MINIO_CONSOLE_PORT|MINIO_BUCKET|\
        MINIO_HOST|MINIO_ENDPOINT|MINIO_SECURE)
          export "$key"="$value"
          ;;
      esac
    done < <(grep -E '^[A-Z_][A-Z0-9_]*=' "$ROOT_ENV" || true)
  fi
  BACKEND_PORT="${BACKEND_PORT:-8000}"
  POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
  POSTGRES_PORT="${POSTGRES_PORT:-55432}"
  MINIO_HOST="${MINIO_HOST:-127.0.0.1}"
  MINIO_API_PORT="${MINIO_API_PORT:-59000}"
  EXPO_PUBLIC_API_BASE_URL="${EXPO_PUBLIC_API_BASE_URL:-http://127.0.0.1:${BACKEND_PORT}/api/v1}"
}

ensure_env_files() {
  if [[ ! -f "$ROOT_ENV" ]]; then
    run cp "$ROOT_DIR/.env.example" "$ROOT_ENV"
  fi
  if [[ ! -f "$BACKEND_ENV" ]]; then
    run cp "$ROOT_DIR/.env.example" "$BACKEND_ENV"
  fi
  load_root_env
}

ensure_command() {
  local command_name="$1"
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Missing command: $command_name" >&2
    exit 1
  }
}

is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1
  local pid
  pid="$(cat "$pid_file")"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

wait_for_tcp() {
  local host="$1"
  local port="$2"
  local label="$3"
  local max_attempts="${4:-60}"

  if [[ "$DRY_RUN" == "1" ]]; then
    printf '+ wait for %s on %s:%s\n' "$label" "$host" "$port"
    return
  fi

  for _ in $(seq 1 "$max_attempts"); do
    if (echo >"/dev/tcp/$host/$port") >/dev/null 2>&1; then
      log "$label is reachable at $host:$port"
      return
    fi
    sleep 1
  done

  echo "Timed out waiting for $label at $host:$port" >&2
  exit 1
}

start_deps() {
  [[ "${SKIP_DEPS:-0}" == "1" ]] && return
  ensure_command docker
  run_shell "cd '$ROOT_DIR' && docker compose up -d"
  wait_for_tcp "$POSTGRES_HOST" "$POSTGRES_PORT" "PostgreSQL"
  wait_for_tcp "$MINIO_HOST" "$MINIO_API_PORT" "MinIO"
}

ensure_backend_deps() {
  ensure_command python3
  if [[ ! -x "$ROOT_DIR/venv/bin/python" ]]; then
    run_shell "cd '$ROOT_DIR' && python3 -m venv venv"
  fi
  if [[ ! -x "$ROOT_DIR/venv/bin/uvicorn" || ! -x "$ROOT_DIR/venv/bin/alembic" ]]; then
    run_shell "cd '$ROOT_DIR' && venv/bin/pip install -r backend/requirements.txt"
  fi
}

start_backend() {
  [[ "${SKIP_BACKEND:-0}" == "1" ]] && return
  if is_running "$BACKEND_PID_FILE"; then
    log "Backend already running with PID $(cat "$BACKEND_PID_FILE")"
    return
  fi

  ensure_backend_deps
  run_shell "cd '$ROOT_DIR/backend' && ../venv/bin/alembic upgrade head"
  run_shell "cd '$ROOT_DIR/backend' && PYTHONPATH=. ../venv/bin/python -m app.seed"

  local log_file="$LOG_DIR/backend.log"
  local command="cd '$ROOT_DIR/backend' && PYTHONPATH=. ../venv/bin/uvicorn app.main:app --reload --port $BACKEND_PORT"
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '+ %s > %s 2>&1 &\n' "$command" "$log_file"
  else
    log "Starting backend on http://$BACKEND_HOST:$BACKEND_PORT"
    bash -lc "$command" >"$log_file" 2>&1 &
    echo "$!" >"$BACKEND_PID_FILE"
    wait_for_tcp "$BACKEND_HOST" "$BACKEND_PORT" "FastAPI"
  fi
}

ensure_frontend_deps() {
  ensure_command npm
  if [[ ! -d "$ROOT_DIR/apps/mobile/node_modules" ]]; then
    run_shell "cd '$ROOT_DIR/apps/mobile' && npm install"
  fi
}

start_frontend() {
  [[ "${SKIP_FRONTEND:-0}" == "1" ]] && return
  if is_running "$FRONTEND_PID_FILE"; then
    log "Frontend already running with PID $(cat "$FRONTEND_PID_FILE")"
    return
  fi

  ensure_frontend_deps
  local log_file="$LOG_DIR/frontend.log"
  local command="cd '$ROOT_DIR/apps/mobile' && EXPO_PUBLIC_API_BASE_URL='$EXPO_PUBLIC_API_BASE_URL' npm start"
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '+ %s > %s 2>&1 &\n' "$command" "$log_file"
  else
    log "Starting Expo frontend"
    bash -lc "$command" >"$log_file" 2>&1 &
    echo "$!" >"$FRONTEND_PID_FILE"
    log "Expo logs: $log_file"
  fi
}

stop_process() {
  local name="$1"
  local pid_file="$2"

  if [[ "$DRY_RUN" == "1" ]]; then
    printf '+ stop %s\n' "$name"
    return
  fi

  if ! is_running "$pid_file"; then
    rm -f "$pid_file"
    log "$name is not running"
    return
  fi

  local pid
  pid="$(cat "$pid_file")"
  log "Stopping $name with PID $pid"
  pkill -TERM -P "$pid" >/dev/null 2>&1 || true
  kill "$pid" >/dev/null 2>&1 || true

  for _ in $(seq 1 10); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      rm -f "$pid_file"
      return
    fi
    sleep 1
  done

  pkill -KILL -P "$pid" >/dev/null 2>&1 || true
  kill -KILL "$pid" >/dev/null 2>&1 || true
  rm -f "$pid_file"
}

stop_deps() {
  [[ "${SKIP_DEPS:-0}" == "1" || "${KEEP_DEPS:-0}" == "1" ]] && return
  if [[ "${WITH_VOLUMES:-0}" == "1" ]]; then
    run_shell "cd '$ROOT_DIR' && docker compose down -v"
  else
    run_shell "cd '$ROOT_DIR' && docker compose down"
  fi
}

start_all() {
  ensure_dirs
  ensure_env_files
  start_deps
  start_backend
  start_frontend
  log "Started. Backend: http://127.0.0.1:$BACKEND_PORT/docs"
  log "Expo output: $LOG_DIR/frontend.log"
}

stop_all() {
  ensure_dirs
  stop_process "backend" "$BACKEND_PID_FILE"
  stop_process "frontend" "$FRONTEND_PID_FILE"
  stop_deps
}

status_all() {
  ensure_dirs
  load_root_env
  echo "Dependency services:"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "  docker compose ps"
  else
    (cd "$ROOT_DIR" && docker compose ps) || true
  fi

  if is_running "$BACKEND_PID_FILE"; then
    echo "Backend: running (PID $(cat "$BACKEND_PID_FILE"))"
  else
    echo "Backend: stopped"
  fi

  if is_running "$FRONTEND_PID_FILE"; then
    echo "Frontend: running (PID $(cat "$FRONTEND_PID_FILE"))"
  else
    echo "Frontend: stopped"
  fi
}

tail_logs() {
  ensure_dirs
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '+ tail -f %s %s\n' "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log"
    return
  fi
  touch "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log"
  tail -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log"
}

main() {
  local action="${1:-help}"
  case "$action" in
    start)
      start_all
      ;;
    stop)
      stop_all
      ;;
    restart)
      stop_all
      start_all
      ;;
    status)
      status_all
      ;;
    logs)
      tail_logs
      ;;
    help|--help|-h)
      usage
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
}

main "$@"
