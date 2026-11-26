#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  echo "Setting up for the first time..."
  python3 -m venv .venv
  .venv/bin/python -m pip install --upgrade pip >/dev/null
fi
.venv/bin/python -m pip install -q -r requirements.txt
exec .venv/bin/python app.py "$@"
