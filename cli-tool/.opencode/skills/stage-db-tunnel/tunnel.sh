#!/usr/bin/env bash
set -euo pipefail

PORT=15432
LOCAL_HOST=127.0.0.1
REMOTE_HOST=192.168.0.140
REMOTE_PORT=5432
SSH_HOST=alltime-stage
DB_NAME=goods
DB_USER=services_user
FORWARD_SPEC="${PORT}:${REMOTE_HOST}:${REMOTE_PORT}"
PGREP_PATTERN="ssh .* -L ${PORT}:192\\.168\\.0\\.140:${REMOTE_PORT} ${SSH_HOST}"

usage() {
  printf 'Usage: %s <up|status|down>\n' "$0" >&2
}

require_tools() {
  local tool
  for tool in ssh ss pgrep pg_isready; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      printf 'Missing required tool: %s\n' "$tool" >&2
      exit 1
    fi
  done
}

listener_lines() {
  local line found=0

  while IFS= read -r line; do
    [[ "$line" == *":${PORT}"* ]] || continue
    printf '%s\n' "$line"
    found=1
  done < <(ss -tlnp)

  [[ $found -eq 1 ]]
}

tunnel_pids() {
  local line

  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    printf '%s\n' "${line%% *}"
  done < <(pgrep -af "$PGREP_PATTERN" || true)
}

join_by() {
  local delimiter=$1
  shift
  local first=1

  for value in "$@"; do
    if [[ $first -eq 1 ]]; then
      printf '%s' "$value"
      first=0
      continue
    fi

    printf '%s%s' "$delimiter" "$value"
  done
}

collect_tunnel_state() {
  LISTENERS="$(listener_lines || true)"
  mapfile -t PIDS < <(tunnel_pids)
}

ensure_no_port_conflict() {
  collect_tunnel_state

  if [[ -n "$LISTENERS" && ${#PIDS[@]} -eq 0 ]]; then
    printf 'status: conflict\n' >&2
    printf 'port: %s\n' "$PORT" >&2
    printf '%s\n' "$LISTENERS" >&2
    printf 'Port %s is already in use by a non-managed listener.\n' "$PORT" >&2
    exit 1
  fi
}

postgres_ready() {
  pg_isready -h "$LOCAL_HOST" -p "$PORT" -d "$DB_NAME" -U "$DB_USER"
}

print_up_status() {
  local pg_ready_output

  pg_ready_output="$(postgres_ready)"

  printf 'status: up\n'
  printf 'local_endpoint: %s:%s\n' "$LOCAL_HOST" "$PORT"
  printf 'remote_endpoint: %s:%s\n' "$REMOTE_HOST" "$REMOTE_PORT"
  printf 'ssh_host: %s\n' "$SSH_HOST"
  printf 'ssh_pid: %s\n' "$(join_by ',' "${PIDS[@]}")"
  printf 'pg_isready: %s\n' "$pg_ready_output"
}

status_cmd() {
  ensure_no_port_conflict

  if [[ ${#PIDS[@]} -eq 0 ]]; then
    printf 'status: down\n'
    printf 'local_endpoint: %s:%s\n' "$LOCAL_HOST" "$PORT"
    return 0
  fi

  print_up_status
}

up_cmd() {
  ensure_no_port_conflict

  if [[ ${#PIDS[@]} -gt 0 ]]; then
    printf 'Tunnel already active.\n'
    print_up_status
    return 0
  fi

  ssh -o ExitOnForwardFailure=yes -f -N -L "$FORWARD_SPEC" "$SSH_HOST"

  local attempt
  for attempt in 1 2 3 4 5; do
    ensure_no_port_conflict
    if [[ ${#PIDS[@]} -gt 0 ]]; then
      break
    fi
    sleep 1
  done

  if [[ ${#PIDS[@]} -eq 0 ]]; then
    printf 'Failed to start stage DB tunnel.\n' >&2
    exit 1
  fi

  printf 'Tunnel started.\n'
  print_up_status
}

down_cmd() {
  ensure_no_port_conflict

  if [[ ${#PIDS[@]} -eq 0 ]]; then
    printf 'Tunnel already down.\n'
    return 0
  fi

  kill "${PIDS[@]}"

  local attempt
  for attempt in 1 2 3 4 5; do
    collect_tunnel_state
    if [[ ${#PIDS[@]} -eq 0 ]]; then
      break
    fi
    sleep 1
  done

  if [[ ${#PIDS[@]} -gt 0 ]]; then
    printf 'Failed to stop stage DB tunnel.\n' >&2
    exit 1
  fi

  printf 'status: down\n'
  printf 'local_endpoint: %s:%s\n' "$LOCAL_HOST" "$PORT"
}

main() {
  require_tools

  if [[ $# -ne 1 ]]; then
    usage
    exit 1
  fi

  case "$1" in
    up)
      up_cmd
      ;;
    status)
      status_cmd
      ;;
    down)
      down_cmd
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
