#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_SCRIPT="$ROOT_DIR/scripts/dev.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" == *"$needle"* ]] || fail "expected output to contain: $needle"
}

[[ -f "$DEV_SCRIPT" ]] || fail "scripts/dev.sh should exist"

bash -n "$DEV_SCRIPT"

help_output="$(bash "$DEV_SCRIPT" help)"
assert_contains "$help_output" "Usage:"
assert_contains "$help_output" "start"
assert_contains "$help_output" "stop"
assert_contains "$help_output" "restart"
assert_contains "$help_output" "status"
assert_contains "$help_output" "logs"
assert_contains "$help_output" "SKIP_FRONTEND=1"
assert_contains "$help_output" "SKIP_BACKEND=1"
assert_contains "$help_output" "SKIP_DEPS=1"

start_output="$(DRY_RUN=1 bash "$DEV_SCRIPT" start)"
assert_contains "$start_output" "docker compose up -d"
assert_contains "$start_output" "alembic upgrade head"
assert_contains "$start_output" "uvicorn app.main:app --reload --port 8000"
assert_contains "$start_output" "npm start"

stop_output="$(DRY_RUN=1 bash "$DEV_SCRIPT" stop)"
assert_contains "$stop_output" "stop backend"
assert_contains "$stop_output" "stop frontend"
assert_contains "$stop_output" "docker compose down"

status_output="$(DRY_RUN=1 bash "$DEV_SCRIPT" status)"
assert_contains "$status_output" "Dependency services"
assert_contains "$status_output" "Backend"
assert_contains "$status_output" "Frontend"

echo "scripts/dev.sh contract tests passed"
