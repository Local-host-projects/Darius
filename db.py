"""SQLite layer — thin helpers + schema. Monolith, zero config."""
import json
import sqlite3
import threading
from contextlib import contextmanager

import config

_local = threading.local()

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  gemini_key TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tokens(
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS agents(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  personality TEXT NOT NULL DEFAULT '',
  opening_message TEXT NOT NULL DEFAULT '',
  disclose_ai INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  schema_json TEXT NOT NULL DEFAULT '{}',
  logic_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS conversations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  respondent_name TEXT NOT NULL DEFAULT '',
  respondent_contact TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  broadcast_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS records(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  conversation_id INTEGER UNIQUE NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  computed_json TEXT NOT NULL DEFAULT '{}',
  computed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS broadcasts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL,
  instruction TEXT NOT NULL DEFAULT '',
  targets_json TEXT NOT NULL DEFAULT '[]',
  sent_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, id);
CREATE INDEX IF NOT EXISTS idx_conv_agent ON conversations(agent_id);
"""


def connect() -> sqlite3.Connection:
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = sqlite3.connect(config.DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        _local.conn = conn
    return conn


def init_db():
    connect().executescript(SCHEMA)
    connect().commit()


@contextmanager
def tx():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def q(sql, params=()):
    """Query → list[dict]."""
    cur = connect().execute(sql, params)
    return [dict(r) for r in cur.fetchall()]


def one(sql, params=()):
    rows = q(sql, params)
    return rows[0] if rows else None


def ex(sql, params=()):
    cur = connect().execute(sql, params)
    connect().commit()
    return cur.lastrowid


def jload(s, default):
    try:
        v = json.loads(s) if s else default
        return v if v is not None else default
    except (json.JSONDecodeError, TypeError):
        return default


def jdump(v):
    return json.dumps(v, ensure_ascii=False)
