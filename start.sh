#!/usr/bin/env bash
# TLAH — production deploy
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PID_DIR="$ROOT/.pids"
mkdir -p "$PID_DIR"

PORT="${PORT:-8000}"
WORKERS="${WORKERS:-1}"

echo "=== TLAH Deploy ==="

# ── Build frontend ─────────────────────────────────────────────────

echo "[build] 编译前端..."
cd "$ROOT/frontend"
npm run build >> "$PID_DIR/build.log" 2>&1
echo "[build] 完成"
cd "$ROOT"

# ── Backend (serves API + built frontend) ──────────────────────────

BACKEND_PIDFILE="$PID_DIR/backend.pid"

if [[ -f "$BACKEND_PIDFILE" ]] && kill -0 "$(cat "$BACKEND_PIDFILE")" 2>/dev/null; then
  echo "[server] 已在运行 (PID $(cat "$BACKEND_PIDFILE"))"
else
  echo "[server] 启动 uvicorn (port $PORT, workers=$WORKERS)..."
  cd "$ROOT/backend"
  source .venv/bin/activate
  nohup uvicorn app.main:app \
    --host 127.0.0.1 \
    --port "$PORT" \
    --workers "$WORKERS" \
    --log-level warning \
    >> "$PID_DIR/server.log" 2>&1 &
  echo $! > "$BACKEND_PIDFILE"
  echo "[server] PID $(cat "$BACKEND_PIDFILE")"
  cd "$ROOT"
fi

echo ""
echo "=== TLAH 已部署 ==="
echo "  地址:       http://localhost:$PORT"
echo "  API:        http://localhost:$PORT/api/health"
echo "  日志:       $PID_DIR/server.log"
echo ""
echo "  停止:       $ROOT/stop.sh"
