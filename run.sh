#!/usr/bin/env bash
# Darius — run the monolith
cd "$(dirname "$0")"
pip install -q -r requirements.txt
exec uvicorn main:app --host 0.0.0.0 --port 8000
