"""Darius configuration — env vars + .env loading (no extra deps)."""
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _load_env():
    env_path = os.path.join(BASE_DIR, ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v


_load_env()

# Server-level Gemini key (Google AI Studio) — the AI all features run on when a
# user hasn't set their own key in Settings. On Railway: set as a service variable.
SERVER_GEMINI_KEY = (os.environ.get("DARIUS_SERVER_AI_KEY")
                     or os.environ.get("DARIUS_SERVER_GEMINI_KEY", "")).strip()

DEFAULT_MODEL = os.environ.get("DARIUS_DEFAULT_MODEL", "gemini-2.5-flash").strip()

# Google AI Studio REST root. Override only for tests / API proxies.
GEMINI_BASE = os.environ.get(
    "DARIUS_GEMINI_BASE",
    "https://generativelanguage.googleapis.com/v1beta/models").strip().rstrip("/")

# SQLite file. On Railway, attach a volume (e.g. mounted at /data) and set
# DARIUS_DB=/data/darius.db — otherwise data resets on every redeploy.
DB_PATH = os.environ.get("DARIUS_DB", os.path.join(BASE_DIR, "darius.db"))
