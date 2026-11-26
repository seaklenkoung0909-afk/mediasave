@echo off
cd /d "%~dp0"
if not exist .venv (
  echo Setting up for the first time...
  python -m venv .venv || (echo Python 3.10+ is required: https://www.python.org/downloads/ & pause & exit /b 1)
  .venv\Scripts\python -m pip install --upgrade pip >nul
)
.venv\Scripts\python -m pip install -q -r requirements.txt
.venv\Scripts\python app.py %*
pause
