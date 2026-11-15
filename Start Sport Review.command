#!/bin/bash
# Sport Review — double-click to start the local server and open the site.
# Close this Terminal window (or press Ctrl+C) to stop the server.

cd "$(dirname "$0")" || exit 1
PORT=8000
URL="http://localhost:$PORT"

# Already running? Just open the browser.
if curl -s --max-time 1 "$URL/api/status" >/dev/null 2>&1; then
  echo "Sport Review is already running — opening $URL"
  open "$URL"
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is not installed. Run: xcode-select --install"
  read -r -p "Press Enter to close..."
  exit 1
fi

# Open the browser once the server is up
( for _ in $(seq 1 20); do
    curl -s --max-time 1 "$URL/api/status" >/dev/null 2>&1 && { open "$URL"; break; }
    sleep 0.3
  done ) &

python3 server.py "$PORT"
