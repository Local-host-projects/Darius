@echo off
title Darius
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Creating virtual environment with Python 3.12...
    py -3.12 -m venv .venv
    .venv\Scripts\python.exe -m pip install -r requirements.txt
)

echo.
echo Starting Darius at http://127.0.0.1:8000
echo Press Ctrl+C to stop.
echo.
start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:8000"
.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
pause
