#!/usr/bin/env bash
# TLAH — 一键停止（后端 + 前端）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PID_DIR="$ROOT/.pids"

if [[ ! -d "$PID_DIR" ]]; then
  echo "没有找到 .pids 目录，可能未通过 start.sh 启动。"
  exit 0
fi

echo "=== TLAH Stop ==="

_stop() {
  local name="$1"
  local pidfile="$PID_DIR/$name.pid"

  if [[ ! -f "$pidfile" ]]; then
    echo "[$name] 未找到 PID 文件，跳过。"
    return
  fi

  local pid
  pid="$(cat "$pidfile" 2>/dev/null || true)"

  if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
    echo "[$name] 进程未运行 (PID $pid)，清理 PID 文件。"
    rm -f "$pidfile"
    return
  fi

  echo "[$name] 停止 PID $pid..."
  kill -TERM "$pid" 2>/dev/null || true

  # 等待优雅退出
  local i=0
  while kill -0 "$pid" 2>/dev/null && [[ $i -lt 15 ]]; do
    sleep 1
    i=$((i + 1))
  done

  if kill -0 "$pid" 2>/dev/null; then
    echo "[$name] 超时，发送 SIGKILL..."
    kill -KILL "$pid" 2>/dev/null || true
    sleep 1
  fi

  rm -f "$pidfile"
  echo "[$name] 已停止。"
}

_stop "frontend"
_stop "backend"

echo ""
echo "=== TLAH 已停止 ==="
