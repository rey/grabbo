#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# grabbo — local development runner
# Edit the variables below, then: bash go.sh
# Rebuilds index.html, then serves this folder:
#   http://localhost:PORT/index.html       drag the link to the bookmarks bar
#   http://localhost:PORT/test/fixture.html  page to try the bookmarklet on
# ---------------------------------------------------------------------------

HOST="127.0.0.1"  # 0.0.0.0 serves the whole folder, .git included, to your network. Not a secure context.
PORT="8000"

# ---------------------------------------------------------------------------

cd "$(dirname "$0")"

python3 build.py

echo "Install page: http://localhost:$PORT/index.html"
echo "Test page:    http://localhost:$PORT/test/fixture.html"

exec python3 -m http.server "$PORT" --bind "$HOST"
