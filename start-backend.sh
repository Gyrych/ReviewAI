#!/bin/bash
PORT=${1:-4001}
SERVICE_DIR="$(cd "$(dirname "$0")" && pwd)/services/circuit-agent-py"
LOG_FILE="$SERVICE_DIR/backend.log"
PID_FILE="$SERVICE_DIR/backend.pid"

# kill any process listening on port
OLD_PID=$(lsof -ti tcp:$PORT 2>/dev/null || true)
if [ -n "$OLD_PID" ]; then
  echo "Killing old process $OLD_PID"
  kill -9 $OLD_PID || true
fi

if [ -f "$SERVICE_DIR/venv/bin/activate" ]; then
  echo "Activating venv"
  source "$SERVICE_DIR/venv/bin/activate"
fi

pip install -r "$SERVICE_DIR/requirements.txt" --no-input

nohup python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT > "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo $NEW_PID > "$PID_FILE"
echo "Started with PID $NEW_PID, logs: $LOG_FILE"
