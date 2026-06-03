#!/usr/bin/env bash
# TLAH — 一键后台启动（后端 + 前端）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PID_DIR="$ROOT/.pids"
mkdir -p "$PID_DIR"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

echo "=== TLAH Start ==="

# ── Backend ────────────────────────────────────────────────────────
BACKEND_PIDFILE="$PID_DIR/backend.pid"

if [[ -f "$BACKEND_PIDFILE" ]] && kill -0 "$(cat "$BACKEND_PIDFILE")" 2>/dev/null; then
  echo "[backend] 已在运行 (PID $(cat "$BACKEND_PIDFILE"))"
else
  echo "[backend] 启动 FastAPI (port $BACKEND_PORT)..."
  cd "$ROOT/backend"
  source .venv/bin/activate
  nohup uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" \
    >> "$PID_DIR/backend.log" 2>&1 &
  echo $! > "$BACKEND_PIDFILE"
  echo "[backend] PID $(cat "$BACKEND_PIDFILE")"
  cd "$ROOT"
fi

# ── Frontend ───────────────────────────────────────────────────────
FRONTEND_PIDFILE="$PID_DIR/frontend.pid"

if [[ -f "$FRONTEND_PIDFILE" ]] && kill -0 "$(cat "$FRONTEND_PIDFILE")" 2>/dev/null; then
  echo "[frontend] 已在运行 (PID $(cat "$FRONTEND_PIDFILE"))"
else
  echo "[frontend] 启动 Vite (port $FRONTEND_PORT)..."
  cd "$ROOT/frontend"
  nohup npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" \
    >> "$PID_DIR/frontend.log" 2>&1 &
  echo $! > "$FRONTEND_PIDFILE"
  echo "[frontend] PID $(cat "$FRONTEND_PIDFILE")"
  cd "$ROOT"
fi

echo ""
echo "=== TLAH 已启动 ==="
echo "  本地:       http://localhost:$FRONTEND_PORT"
echo "  后端 API:   http://localhost:$BACKEND_PORT/api/health"
echo "  日志目录:   $PID_DIR/"
echo ""
echo "  停止:       $ROOT/stop.sh"
