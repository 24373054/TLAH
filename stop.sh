#!/usr/bin/env bash
# TLAH — stop production server
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PID_DIR="$ROOT/.pids"

if [[ ! -d "$PID_DIR" ]]; then
  echo "没有找到 .pids 目录，可能未通过 start.sh 启动。"
  exit 0
fi

echo "=== TLAH Stop ==="

# Kill uvicorn and its workers by PID file
PIDFILE="$PID_DIR/backend.pid"

if [[ ! -f "$PIDFILE" ]]; then
  echo "未找到 PID 文件，尝试按进程名清理..."
  pkill -f "uvicorn app.main:app" 2>/dev/null && echo "已清理 uvicorn 进程。" || echo "未找到运行中的进程。"
  exit 0
fi

pid="$(cat "$PIDFILE" 2>/dev/null || true)"

if [[ -z "$pid" ]]; then
  rm -f "$PIDFILE"
  echo "PID 文件为空，已清理。"
  exit 0
fi

# Kill the master uvicorn process — workers will exit automatically
echo "[server] 停止 PID $pid 及其 workers..."
kill -TERM "$pid" 2>/dev/null || true

# Wait for graceful shutdown
i=0
while kill -0 "$pid" 2>/dev/null && [[ $i -lt 15 ]]; do
  sleep 1
  i=$((i + 1))
done

if kill -0 "$pid" 2>/dev/null; then
  echo "[server] 超时，强制终止..."
  kill -KILL "$pid" 2>/dev/null || true
  sleep 1
fi

# Also clean up any remaining workers
pkill -f "uvicorn.*app.main:app" 2>/dev/null || true

rm -f "$PIDFILE"

echo ""
echo "=== TLAH 已停止 ==="
