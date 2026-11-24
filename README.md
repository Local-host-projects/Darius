# Darius — talk once, reach a thousand 🎣

**Spawn conversational agents that interview people at scale and pour their answers into a
living, queryable spreadsheet — then talk back.**

A monolithic FastAPI PWA: one process serves the API, the SPA frontend and the PWA shell.
No build step, no Node, no queues — `uvicorn main:app` and you're live.

> Full product digest + flow definitions: [`docs/DESIGN.md`](docs/DESIGN.md)

---

## Quick start

```bash
bash run.sh          # installs deps + serves on http://localhost:8000
# or
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

First run creates `darius.db` (SQLite). Sign up, spawn an agent, share the `/c/{slug}` link.

## AI — Gemini only (Google AI Studio)

One provider, no fallbacks or demo mode. Two key sources, in priority order:

1. **Per-user key** — paste your [Google AI Studio](https://aistudio.google.com/apikey) key in
   **Settings**. Stored against your account, used for your agents only.
2. **Server key** — `DARIUS_SERVER_AI_KEY` in `.env` (local) or a Railway variable (cloud).
   Users without their own key automatically ride it.

```env
DARIUS_SERVER_AI_KEY=AQ.…        # your Google AI Studio key
DARIUS_DEFAULT_MODEL=gemini-2.5-flash
```

**Model**: `gemini-2.5-flash` is the free-tier default (fast, generous daily quota). If you
need more free headroom, set `DARIUS_DEFAULT_MODEL=gemini-2.5-flash-lite`; change it per user
in Settings too. **Test it** button pings Gemini and tells you whether it used your key or the
server's. When the free-tier quota is hit the UI says so plainly (429) — nothing is faked.

## Deploy to Railway

The repo is Railway-ready: `railway.json` (Nixpacks + `uvicorn` on `$PORT`) sits next to
`requirements.txt` in `darius/`.

1. Push the project to GitHub. In Railway: **New Project → Deploy from GitHub repo**, and set
   **Root Directory = `darius`** (that's where `railway.json` lives).
2. Add variables (Railway → your service → Variables):
   - `DARIUS_SERVER_AI_KEY` — your Google AI Studio key (required)
   - `DARIUS_DEFAULT_MODEL` — optional, defaults to `gemini-2.5-flash`
3. **Attach a volume** (Railway → service → Volumes, mount path `/data`) and set
   `DARIUS_DB=/data/darius.db`. Without it, SQLite resets on every redeploy.
4. Deploy. Generate a domain (Settings → Networking) — the PWA is served from the same origin.

Note: the Gemini API is geo-restricted; deploy in a supported region (Railway's US/EU regions
are fine). If a call fails the app surfaces Google's reason in the UI instead of guessing.

## What's inside (feature → where)

| Feature | Where |
|---|---|
| Spawn agent + shareable link | Dashboard → spawn → Setup tab ("share the net") |
| Schema drafting from a plain-language brief | Setup → "re-draft with AI" / at creation |
| Semi-structured interviews (one question at a time, adaptive) | Public chat `/c/{slug}` |
| Chat → structured records (live extraction) | Records tab |
| Intelligent spreadsheet: computed qualitative columns | Setup (logic editor) + Records ("re-grade") |
| Natural-language query = semantic zoom (all → segment → person) | Records query bar |
| Hand-edited cells (operator fixes a value) | double-click any cell / booth drawer |
| Operator override — step into any booth | Records → booth → / Inbox → name-tag |
| Merged unified stream (each respondent still 1:1) | Inbox tab |
| Broadcast to a filtered slice, "only send to / leave out" | Compose modal (recipient checklist) |
| Raw vs AI-refined sends | Compose mode: raw / refined |
| Delegated mass replies from one instruction | Compose mode: delegate |
| Two-way closure — replies land in the person's own thread | automatic; completed chats reopen |
| AI disclosure by default (trust + NDPA-friendly) | Setup toggle; shown as a chip in public chat |
| Bring-your-own Gemini key / server key | Settings |
| PWA (installable, offline shell, API always networked) | manifest + sw.js + icons |

## Architecture

```
darius/
├── main.py            # FastAPI: every route + SPA/PWA static serving
├── ai.py              # all Gemini calls (interview, draft, rules, query, refine, delegate)
├── db.py              # SQLite schema + helpers (WAL)
├── auth.py            # PBKDF2 + bearer tokens
├── config.py          # .env loading
├── docs/DESIGN.md     # feature digest + flows
└── static/            # SPA (vanilla ES modules) + styles + manifest + sw + icons
    ├── js/app.js        # router, login, dashboard, settings
    ├── js/workspace.js  # setup / records / inbox / broadcasts
    ├── js/chat.js       # public 1:1 chat
    └── css/styles.css   # scrapbook / neo-editorial aesthetic
```

**One record = one conversation = one respondent.** Operator messages are delivered into the
respondent's own 1:1 thread; respondents never see each other. Completed conversations reopen
whenever the operator sends something, so the loop closes both ways.

## API surface (all JSON, bearer-token auth except `/api/public/*`)

- `POST /api/auth/signup · login · logout` — `GET /api/auth/me`
- `GET/PUT /api/settings` — `POST /api/settings/test`
- `GET/POST /api/agents` — `GET/PUT/DELETE /api/agents/{id}` — `POST /api/agents/{id}/generate-schema`
- `GET /api/agents/{id}/records` — `PUT /api/records/{id}` — `POST /api/agents/{id}/recompute`
- `POST /api/agents/{id}/query` — the semantic zoom
- `GET /api/agents/{id}/stream` — merged inbox — `GET/POST /api/conversations/{id}[/reply|/status]`
- `POST /api/agents/{id}/compose` — raw / refined / delegate — `GET /api/agents/{id}/broadcasts`
- Public: `GET /api/public/agents/{slug}` — `POST /api/public/agents/{slug}/join` —
  `POST /api/public/message` — `GET /api/public/thread/{session_token}`

Interactive docs at `/docs` (FastAPI auto).

## Notes

- SQLite in WAL mode; fine for a small team. On Railway use a volume (`DARIUS_DB=/data/darius.db`);
  swap `db.py` for Postgres later if you outgrow it.
- The interviewer keeps a scratchpad note per conversation (fields already asked) — no repeats.
- Query operates over up to 400 records per call; batch your thinking or add embeddings later.
- Built as an entry for the **AI in Nigeria × Flutterwave AI Startup Challenge** — the
  freelancer/merchant use case (bio link → interviews → hot-lead broadcast) is the headline demo.
