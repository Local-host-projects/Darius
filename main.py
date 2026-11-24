"""Darius — monolithic FastAPI app: API + SPA + PWA in one process."""
import re
import secrets
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import Body, Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import ai
import auth
import config
import db

app = FastAPI(title="Darius", docs_url="/docs")
STATIC_DIR = Path(__file__).parent / "static"


@app.on_event("startup")
def _startup():
    db.init_db()


def fail(status: int, msg: str):
    raise HTTPException(status, msg)


def now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return (s or "agent")[:32] + "-" + secrets.token_hex(2)


# ================================================================ auth

@app.post("/api/auth/signup")
def signup(body: dict = Body(...)):
    username = str(body.get("username", "")).strip().lower()
    password = str(body.get("password", ""))
    display_name = str(body.get("display_name", "")).strip() or username
    if not re.fullmatch(r"[a-z0-9_.-]{3,24}", username):
        fail(400, "Username: 3-24 chars, letters/numbers/._- only")
    if len(password) < 6:
        fail(400, "Password needs at least 6 characters")
    if db.one("SELECT id FROM users WHERE username=?", (username,)):
        fail(400, "Username taken")
    uid = db.ex(
        "INSERT INTO users(username, password_hash, display_name) VALUES(?,?,?)",
        (username, auth.hash_password(password), display_name[:60]),
    )
    token = auth.create_token(uid)
    user = db.one("SELECT * FROM users WHERE id=?", (uid,))
    return {"token": token, "user": _user_public(user)}


@app.post("/api/auth/login")
def login(body: dict = Body(...)):
    username = str(body.get("username", "")).strip().lower()
    user = db.one("SELECT * FROM users WHERE username=?", (username,))
    if not user or not auth.verify_password(str(body.get("password", "")), user["password_hash"]):
        fail(400, "Wrong username or password")
    return {"token": auth.create_token(user["id"]), "user": _user_public(user)}


@app.post("/api/auth/logout")
def logout(request: Request, user: dict = Depends(auth.require_user)):
    token = (request.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
    if token:
        db.ex("DELETE FROM tokens WHERE token=?", (token,))
    return {"ok": True}


@app.get("/api/auth/me")
def me(user: dict = Depends(auth.require_user)):
    return {"user": _user_public(user)}


def _user_public(u: dict) -> dict:
    return {"id": u["id"], "username": u["username"], "display_name": u["display_name"]}


# ================================================================ settings

@app.get("/api/settings")
def get_settings(user: dict = Depends(auth.require_user)):
    key = (user["gemini_key"] or "").strip()
    return {
        "has_user_key": bool(key),
        "key_masked": (key[:6] + "…" + key[-4:]) if len(key) > 12 else ("set" if key else ""),
        "model": user["model"] or config.DEFAULT_MODEL,
        "server_key_active": bool(config.SERVER_GEMINI_KEY),
        "will_use": "your key" if key else ("server key" if config.SERVER_GEMINI_KEY
                                           else "nothing — set DARIUS_SERVER_AI_KEY"),
    }


@app.put("/api/settings")
def put_settings(body: dict = Body(...), user: dict = Depends(auth.require_user)):
    if "gemini_key" in body:
        db.ex("UPDATE users SET gemini_key=? WHERE id=?", (str(body["gemini_key"]).strip(), user["id"]))
    if "model" in body:
        model = str(body["model"]).strip()
        db.ex("UPDATE users SET model=? WHERE id=?", (model, user["id"]))
    return get_settings(user)


@app.post("/api/settings/test")
def test_settings(user: dict = Depends(auth.require_user)):
    key = ai.resolve_key(user)
    model = ai.resolve_model(user)
    if not key:
        return {"ok": False, "error": "No key configured (add yours in Settings)"}
    try:
        ai.test_key(key, model)
        source = "your Gemini key" if (user["gemini_key"] or "").strip() else "server key"
        return {"ok": True, "model": model, "source": source}
    except ai.AIUnavailable as e:
        return {"ok": False, "error": str(e)}


# ================================================================ agents

def _agent_dict(a: dict) -> dict:
    return {
        "id": a["id"], "name": a["name"], "slug": a["slug"], "brief": a["brief"],
        "personality": a["personality"], "opening_message": a["opening_message"],
        "disclose_ai": bool(a["disclose_ai"]), "status": a["status"],
        "schema": db.jload(a["schema_json"], {"fields": []}),
        "logic": db.jload(a["logic_json"], {"computed": []}),
        "created_at": a["created_at"],
    }


def _own_agent(agent_id: int, user: dict) -> dict:
    a = db.one("SELECT * FROM agents WHERE id=? AND owner_id=?", (agent_id, user["id"]))
    if not a:
        fail(404, "Agent not found")
    return a


def _clean_schema(agent_dict: dict) -> dict:
    """Normalise a schema payload coming from the editor."""
    fields = []
    for f in agent_dict.get("fields") or []:
        key = re.sub(r"[^a-z0-9_]+", "_", str(f.get("key") or f.get("label", "")).lower()).strip("_")
        if not key:
            continue
        ftype = str(f.get("type") or "text")
        if ftype not in ("text", "number", "date", "select", "multiselect", "boolean"):
            ftype = "text"
        fields.append({
            "key": key[:40], "label": str(f.get("label") or key)[:60], "type": ftype,
            "description": str(f.get("description") or "")[:300],
            "required": bool(f.get("required")),
            "options": [str(o)[:60] for o in (f.get("options") or [])][:12],
        })
    computeds = []
    for c in agent_dict.get("computed") or []:
        key = re.sub(r"[^a-z0-9_]+", "_", str(c.get("key") or c.get("label", "")).lower()).strip("_")
        if not key:
            continue
        computeds.append({
            "key": key[:40], "label": str(c.get("label") or key)[:60],
            "options": [str(o)[:40] for o in (c.get("options") or [])][:8],
            "rule": str(c.get("rule") or "")[:400],
        })
    return {"fields": fields}, {"computed": computeds}


@app.get("/api/agents")
def list_agents(user: dict = Depends(auth.require_user)):
    rows = db.q(
        """SELECT a.*,
                  (SELECT COUNT(*) FROM conversations c WHERE c.agent_id = a.id) AS conv_count,
                  (SELECT COUNT(*) FROM messages m JOIN conversations c2 ON c2.id = m.conversation_id
                    WHERE c2.agent_id = a.id) AS msg_count
           FROM agents a WHERE a.owner_id=? ORDER BY a.id DESC""",
        (user["id"],),
    )
    return {"agents": [{**_agent_dict(r), "conv_count": r["conv_count"],
                        "msg_count": r["msg_count"]} for r in rows]}


@app.post("/api/agents")
def create_agent(body: dict = Body(...), user: dict = Depends(auth.require_user)):
    name = str(body.get("name", "")).strip()[:60]
    if not name:
        fail(400, "Give your agent a name")
    brief = str(body.get("brief", "")).strip()[:2000]
    a_id = db.ex(
        """INSERT INTO agents(owner_id, name, slug, brief, personality, opening_message)
           VALUES(?,?,?,?,?,?)""",
        (user["id"], name, slugify(name), brief, "", ""),
    )
    draft = None
    if body.get("autodraft", True) and brief:
        try:
            ctx = ai.Ctx(user)
            draft = ai.draft_agent(ctx, name, brief)
        except ai.AIUnavailable as e:
            draft = {"error": str(e)}
    if draft and "error" not in draft:
        schema, logic = _clean_schema({"fields": draft.get("fields"),
                                       "computed": draft.get("computeds")})
        db.ex("""UPDATE agents SET personality=?, opening_message=?, schema_json=?, logic_json=?
                 WHERE id=?""",
              (draft.get("personality", ""), draft.get("opening_message", ""),
               db.jdump(schema), db.jdump(logic), a_id))
    a = db.one("SELECT * FROM agents WHERE id=?", (a_id,))
    out = _agent_dict(a)
    if draft and "error" in draft:
        out["draft_error"] = draft["error"]
    return {"agent": out}


@app.get("/api/agents/{agent_id}")
def get_agent(agent_id: int, user: dict = Depends(auth.require_user)):
    a = _own_agent(agent_id, user)
    stats = db.one(
        """SELECT
             (SELECT COUNT(*) FROM conversations WHERE agent_id=?) AS conv_count,
             (SELECT COUNT(*) FROM conversations WHERE agent_id=? AND status='active') AS active_count,
             (SELECT COUNT(*) FROM messages WHERE conversation_id IN
                (SELECT id FROM conversations WHERE agent_id=?)) AS msg_count""",
        (agent_id, agent_id, agent_id),
    )
    return {"agent": _agent_dict(a), "stats": stats}


@app.put("/api/agents/{agent_id}")
def update_agent(agent_id: int, body: dict = Body(...), user: dict = Depends(auth.require_user)):
    a = _own_agent(agent_id, user)
    sets, vals = [], []
    for col in ("name", "brief", "personality", "opening_message"):
        if col in body:
            sets.append(f"{col}=?")
            vals.append(str(body[col])[:2000])
    if "disclose_ai" in body:
        sets.append("disclose_ai=?")
        vals.append(1 if body["disclose_ai"] else 0)
    if "status" in body:
        if body["status"] not in ("draft", "live", "paused"):
            fail(400, "Bad status")
        sets.append("status=?")
        vals.append(body["status"])
    if "schema" in body or "logic" in body:
        schema_src = body.get("schema") or db.jload(a["schema_json"], {"fields": []})
        logic_src = body.get("logic") or db.jload(a["logic_json"], {"computed": []})
        schema, logic = _clean_schema({"fields": schema_src.get("fields"),
                                       "computed": logic_src.get("computed")})
        sets += ["schema_json=?", "logic_json=?"]
        vals += [db.jdump(schema), db.jdump(logic)]
    if sets:
        vals.append(agent_id)
        db.ex(f"UPDATE agents SET {', '.join(sets)} WHERE id=?", tuple(vals))
    return {"agent": _agent_dict(db.one("SELECT * FROM agents WHERE id=?", (agent_id,)))}


@app.delete("/api/agents/{agent_id}")
def delete_agent(agent_id: int, user: dict = Depends(auth.require_user)):
    _own_agent(agent_id, user)
    convs = [r["id"] for r in db.q("SELECT id FROM conversations WHERE agent_id=?", (agent_id,))]
    with db.tx() as conn:
        for cid in convs:
            conn.execute("DELETE FROM messages WHERE conversation_id=?", (cid,))
        conn.execute("DELETE FROM records WHERE agent_id=?", (agent_id,))
        conn.execute("DELETE FROM conversations WHERE agent_id=?", (agent_id,))
        conn.execute("DELETE FROM broadcasts WHERE agent_id=?", (agent_id,))
        conn.execute("DELETE FROM agents WHERE id=?", (agent_id,))
    return {"ok": True}


@app.post("/api/agents/{agent_id}/generate-schema")
def gen_schema(agent_id: int, body: dict = Body(...), user: dict = Depends(auth.require_user)):
    a = _own_agent(agent_id, user)
    brief = str(body.get("brief", "")).strip() or a["brief"]
    try:
        ctx = ai.Ctx(user)
        draft = ai.draft_agent(ctx, a["name"], brief)
    except ai.AIUnavailable as e:
        fail(400, str(e))
    schema, logic = _clean_schema({"fields": draft.get("fields"),
                                   "computed": draft.get("computeds")})
    db.ex("""UPDATE agents SET brief=?, personality=?, opening_message=?, schema_json=?,
             logic_json=? WHERE id=?""",
          (brief, draft.get("personality", ""), draft.get("opening_message", ""),
           db.jdump(schema), db.jdump(logic), agent_id))
    return {"agent": _agent_dict(db.one("SELECT * FROM agents WHERE id=?", (agent_id,)))}


# ================================================================ records + query + rules

def _record_rows(agent_id: int) -> list[dict]:
    rows = db.q(
        """SELECT r.id, r.conversation_id, r.data_json, r.computed_json, r.computed_at,
                  c.respondent_name, c.status AS conv_status, c.last_at, c.summary AS note
           FROM records r JOIN conversations c ON c.id = r.conversation_id
           WHERE r.agent_id=? ORDER BY c.last_at DESC""",
        (agent_id,),
    )
    out = []
    for r in rows:
        out.append({
            "id": r["id"], "conversation_id": r["conversation_id"],
            "respondent_name": r["respondent_name"], "conv_status": r["conv_status"],
            "last_at": r["last_at"], "note": r["note"], "computed_at": r["computed_at"],
            "data": db.jload(r["data_json"], {}),
            "computed": db.jload(r["computed_json"], {}),
        })
    return out


@app.get("/api/agents/{agent_id}/records")
def get_records(agent_id: int, user: dict = Depends(auth.require_user)):
    a = _own_agent(agent_id, user)
    return {"rows": _record_rows(agent_id),
            "fields": db.jload(a["schema_json"], {"fields": []}).get("fields", []),
            "computeds": db.jload(a["logic_json"], {"computed": []}).get("computed", [])}


@app.put("/api/records/{record_id}")
def edit_record(record_id: int, body: dict = Body(...), user: dict = Depends(auth.require_user)):
    r = db.one("""SELECT r.* FROM records r JOIN agents a ON a.id=r.agent_id
                  WHERE r.id=? AND a.owner_id=?""", (record_id, user["id"]))
    if not r:
        fail(404, "Record not found")
    agent = db.one("SELECT * FROM agents WHERE id=?", (r["agent_id"],))
    fields = {f["key"]: f for f in db.jload(agent["schema_json"], {"fields": []}).get("fields", [])}
    data = db.jload(r["data_json"], {})
    for k, v in (body.get("data") or {}).items():
        if k in fields:
            data[k] = ai.coerce_value(v, fields[k])
    db.ex("UPDATE records SET data_json=?, updated_at=? WHERE id=?",
          (db.jdump(data), now(), record_id))
    # a named record renames the booth in the inbox too
    for guess in ("name", "your_name", "full_name"):
        if guess in data and data[guess]:
            db.ex("UPDATE conversations SET respondent_name=? WHERE id=?",
                  (str(data[guess])[:60], r["conversation_id"]))
            break
    return {"ok": True}


@app.post("/api/agents/{agent_id}/recompute")
def recompute(agent_id: int, user: dict = Depends(auth.require_user)):
    a = _own_agent(agent_id, user)
    computeds = db.jload(a["logic_json"], {"computed": []}).get("computed", [])
    rows = _record_rows(agent_id)
    if not computeds:
        return {"ok": True, "updated": 0, "message": "No computed columns defined"}
    if not rows:
        return {"ok": True, "updated": 0, "message": "No records yet"}
    try:
        ctx = ai.Ctx(user)
        results = ai.evaluate_rules(ctx, a, [{"id": r["id"], "data": r["data"]} for r in rows])
    except ai.AIUnavailable as e:
        fail(400, str(e))
    for rid, comp in results.items():
        db.ex("UPDATE records SET computed_json=?, computed_at=? WHERE id=?",
              (db.jdump(comp), now(), rid))
    return {"ok": True, "updated": len(results)}


@app.post("/api/agents/{agent_id}/query")
def nl_query(agent_id: int, body: dict = Body(...), user: dict = Depends(auth.require_user)):
    _own_agent(agent_id, user)
    question = str(body.get("question", "")).strip()[:500]
    if not question:
        fail(400, "Ask a question")
    rows = _record_rows(agent_id)
    if not rows:
        return {"ids": [], "segment": "no records yet", "rationale": "Nobody has chatted with this agent yet."}
    try:
        ctx = ai.Ctx(user)
        result = ai.answer_query(ctx, db.one("SELECT * FROM agents WHERE id=?", (agent_id,)),
                                 [{"id": r["id"], "data": r["data"], "computed": r["computed"]}
                                  for r in rows[:400]], question)
    except ai.AIUnavailable as e:
        fail(400, str(e))
    return result


# ================================================================ conversations / stream / override

@app.get("/api/agents/{agent_id}/stream")
def merged_stream(agent_id: int, user: dict = Depends(auth.require_user)):
    _own_agent(agent_id, user)
    rows = db.q(
        """SELECT m.id, m.conversation_id, m.role, m.text, m.created_at, m.broadcast_id,
                  c.respondent_name, c.status AS conv_status
           FROM messages m JOIN conversations c ON c.id = m.conversation_id
           WHERE c.agent_id=? ORDER BY m.id DESC LIMIT 200""",
        (agent_id,),
    )
    return {"messages": [{"id": r["id"], "conversation_id": r["conversation_id"],
                          "role": r["role"], "text": r["text"], "created_at": r["created_at"],
                          "broadcast_id": r["broadcast_id"],
                          "respondent_name": r["respondent_name"],
                          "conv_status": r["conv_status"]} for r in reversed(rows)]}


def _conv_of_agent(conv_id: int, user: dict):
    c = db.one("""SELECT c.* FROM conversations c JOIN agents a ON a.id=c.agent_id
                  WHERE c.id=? AND a.owner_id=?""", (conv_id, user["id"]))
    if not c:
        fail(404, "Conversation not found")
    return c


@app.get("/api/conversations/{conversation_id}")
def conv_thread(conversation_id: int, user: dict = Depends(auth.require_user)):
    c = _conv_of_agent(conversation_id, user)
    msgs = db.q("SELECT * FROM messages WHERE conversation_id=? ORDER BY id", (conversation_id,))
    rec = db.one("SELECT * FROM records WHERE conversation_id=?", (conversation_id,))
    return {"conversation": {"id": c["id"], "respondent_name": c["respondent_name"],
                             "respondent_contact": c["respondent_contact"],
                             "status": c["status"], "last_at": c["last_at"]},
            "record": {"id": rec["id"], "data": db.jload(rec["data_json"], {}),
                       "computed": db.jload(rec["computed_json"], {})} if rec else None,
            "messages": [{"id": m["id"], "role": m["role"], "text": m["text"],
                          "created_at": m["created_at"]} for m in msgs]}


@app.post("/api/conversations/{conversation_id}/reply")
def operator_reply(conversation_id: int, body: dict = Body(...),
                   user: dict = Depends(auth.require_user)):
    c = _conv_of_agent(conversation_id, user)
    text = str(body.get("text", "")).strip()[:4000]
    if not text:
        fail(400, "Message is empty")
    _deliver(c["id"], text)
    return {"ok": True}


@app.post("/api/conversations/{conversation_id}/status")
def conv_status(conversation_id: int, body: dict = Body(...),
                user: dict = Depends(auth.require_user)):
    c = _conv_of_agent(conversation_id, user)
    status = str(body.get("status", ""))
    if status not in ("active", "complete", "archived"):
        fail(400, "Bad status")
    db.ex("UPDATE conversations SET status=? WHERE id=?", (status, c["id"]))
    return {"ok": True}


def _deliver(conv_id: int, text: str, broadcast_id: int | None = None):
    db.ex("INSERT INTO messages(conversation_id, role, text, broadcast_id) VALUES(?,?,?,?)",
          (conv_id, "operator", text, broadcast_id))
    db.ex("UPDATE conversations SET status=CASE WHEN status='archived' THEN status ELSE 'active' END, "
          "last_at=? WHERE id=?", (now(), conv_id))


# ================================================================ compose / broadcast

@app.post("/api/agents/{agent_id}/compose")
def compose(agent_id: int, body: dict = Body(...), user: dict = Depends(auth.require_user)):
    a = _own_agent(agent_id, user)
    mode = str(body.get("mode", "raw"))
    if mode not in ("raw", "refined", "delegate"):
        fail(400, "Bad compose mode")
    text = str(body.get("text", "")).strip()[:4000]
    instruction = str(body.get("instruction", "")).strip()[:2000]
    if mode == "delegate" and not instruction:
        fail(400, "Describe what to reply for you")
    if mode in ("raw", "refined") and not text:
        fail(400, "Message is empty")

    targets = body.get("targets") or {}
    tmode = targets.get("mode", "all")
    rows = _record_rows(agent_id)
    by_conv = {r["conversation_id"]: r for r in rows}
    if tmode == "selected":
        conv_ids = [int(i) for i in (targets.get("ids") or []) if int(i) in by_conv]
    elif tmode == "segment":
        conv_ids = [r["conversation_id"] for r in rows if r["id"] in set(
            int(i) for i in (targets.get("segment_record_ids") or []))]
    else:
        conv_ids = list(by_conv.keys())
    exclude = set(int(i) for i in (targets.get("exclude_ids") or []))
    conv_ids = [cid for cid in conv_ids if cid not in exclude]
    if not conv_ids:
        return {"sent": 0, "message": "No conversations matched this target"}

    b_id = db.ex("""INSERT INTO broadcasts(agent_id, text, mode, instruction, targets_json, sent_count)
                    VALUES(?,?,?,?,?,0)""",
                (agent_id, text if mode != "delegate" else "", mode, instruction,
                 db.jdump(conv_ids)))

    if mode == "raw":
        for cid in conv_ids:
            _deliver(cid, text, b_id)
        sent = len(conv_ids)
        previews = [{"conversation_id": cid,
                     "respondent_name": by_conv[cid]["respondent_name"], "text": text}
                    for cid in conv_ids]
    else:
        items = []
        for cid in conv_ids:
            r = by_conv[cid]
            tail = db.q("""SELECT role, text FROM messages WHERE conversation_id=?
                           ORDER BY id DESC LIMIT 8""", (cid,))
            context = {"record": r["data"], "computed": r["computed"],
                       "recent_chat": [{"role": m["role"], "text": m["text"]}
                                       for m in reversed(tail)]}
            items.append({"id": cid, "name": r["respondent_name"], "context": context})
        try:
            ctx = ai.Ctx(user)
            drafts = (ai.personalized_batch(ctx, a, text, items) if mode == "refined"
                      else ai.delegated_batch(ctx, a, instruction, items))
        except ai.AIUnavailable as e:
            db.ex("DELETE FROM broadcasts WHERE id=?", (b_id,))  # no empty log rows
            fail(400, str(e))
        sent, previews = 0, []
        for cid in conv_ids:
            body_text = drafts.get(cid)
            if not body_text:
                continue
            _deliver(cid, body_text, b_id)
            sent += 1
            previews.append({"conversation_id": cid,
                             "respondent_name": by_conv[cid]["respondent_name"],
                             "text": body_text})
        db.ex("UPDATE broadcasts SET sent_count=? WHERE id=?", (sent, b_id))
        if sent == 0:
            db.ex("DELETE FROM broadcasts WHERE id=?", (b_id,))
            return {"sent": 0, "message": "The AI returned nothing sendable — try again"}
    db.ex("UPDATE broadcasts SET sent_count=? WHERE id=?", (sent, b_id))
    return {"sent": sent, "broadcast_id": b_id, "previews": previews[:8]}


@app.get("/api/agents/{agent_id}/broadcasts")
def broadcasts(agent_id: int, user: dict = Depends(auth.require_user)):
    _own_agent(agent_id, user)
    rows = db.q("SELECT * FROM broadcasts WHERE agent_id=? ORDER BY id DESC LIMIT 50", (agent_id,))
    return {"broadcasts": [{"id": r["id"], "mode": r["mode"],
                            "text": r["text"] or r["instruction"],
                            "sent_count": r["sent_count"], "created_at": r["created_at"]}
                           for r in rows]}


# ================================================================ public (respondent) side

@app.get("/api/public/agents/{slug}")
def public_agent(slug: str):
    a = db.one("SELECT * FROM agents WHERE slug=?", (slug,))
    if not a:
        fail(404, "This agent link doesn't exist")
    owner = db.one("SELECT display_name FROM users WHERE id=?", (a["owner_id"],))
    return {"agent": {"name": a["name"], "slug": a["slug"],
                      "opening_message": a["opening_message"],
                      "disclose_ai": bool(a["disclose_ai"]),
                      "owner": owner["display_name"] if owner else "",
                      "live": a["status"] == "live"}}


@app.post("/api/public/agents/{slug}/join")
def public_join(slug: str, body: dict = Body(default={})):
    a = db.one("SELECT * FROM agents WHERE slug=?", (slug,))
    if not a:
        fail(404, "This agent link doesn't exist")
    session_token = str(body.get("session_token") or "").strip()
    conv = None
    if session_token:
        conv = db.one("SELECT * FROM conversations WHERE session_token=? AND agent_id=?",
                      (session_token, a["id"]))
    if conv is None:
        n = db.one("SELECT COUNT(*) AS n FROM conversations WHERE agent_id=?", (a["id"],))["n"] + 1
        session_token = secrets.token_hex(16)
        cid = db.ex("""INSERT INTO conversations(agent_id, session_token, respondent_name)
                       VALUES(?,?,?)""", (a["id"], session_token, f"Guest #{n}"))
        db.ex("INSERT INTO records(agent_id, conversation_id, data_json) VALUES(?,?,?)",
              (a["id"], cid, "{}"))
        opening = (a["opening_message"] or
                   f"Hi! I'm {a['name']}'s assistant. Have a seat — I'll ask a few things and pass everything along.")
        db.ex("INSERT INTO messages(conversation_id, role, text) VALUES(?,?,?)",
              (cid, "agent", opening))
        conv = db.one("SELECT * FROM conversations WHERE id=?", (cid,))
    msgs = db.q("SELECT role, text, created_at FROM messages WHERE conversation_id=? ORDER BY id",
                (conv["id"],))
    return {"session_token": conv["session_token"], "status": conv["status"],
            "respondent_name": conv["respondent_name"],
            "messages": [{"role": ("user" if m["role"] == "user" else "agent"),
                          "text": m["text"], "created_at": m["created_at"]} for m in msgs]}


@app.post("/api/public/message")
def public_message(body: dict = Body(...)):
    session_token = str(body.get("session_token") or "").strip()
    text = str(body.get("text", "")).strip()[:4000]
    conv = db.one("SELECT * FROM conversations WHERE session_token=?", (session_token,))
    if not conv:
        fail(404, "Session not found — reload the page")
    if not text:
        fail(400, "Message is empty")
    a = db.one("SELECT * FROM agents WHERE id=?", (conv["agent_id"],))
    owner = db.one("SELECT * FROM users WHERE id=?", (a["owner_id"],))
    rec = db.one("SELECT * FROM records WHERE conversation_id=?", (conv["id"],))
    data = db.jload(rec["data_json"], {}) if rec else {}

    history = db.q("""SELECT role, text FROM messages WHERE conversation_id=?
                      ORDER BY id DESC LIMIT 30""", (conv["id"],))
    history = [{"role": m["role"], "text": m["text"]} for m in reversed(history)]
    history.append({"role": "user", "text": text})  # pending message included

    try:
        ctx = ai.Ctx(owner)
        turn = ai.interview_turn(ctx, a, data, conv["summary"], history, text)
    except ai.AIUnavailable as e:
        return JSONResponse(status_code=503, content={"detail": str(e),
                                                      "ai_unavailable": True})

    reply = turn.get("reply") or "…"
    db.ex("INSERT INTO messages(conversation_id, role, text) VALUES(?,?,?)",
          (conv["id"], "user", text))
    db.ex("INSERT INTO messages(conversation_id, role, text) VALUES(?,?,?)",
          (conv["id"], "agent", reply))

    fields = {f["key"]: f for f in db.jload(a["schema_json"], {"fields": []}).get("fields", [])}
    updates = turn.get("updates") or {}
    for k, v in updates.items():
        if k in fields and v not in ("", None):
            data[k] = ai.coerce_value(v, fields[k])
    if rec:
        db.ex("UPDATE records SET data_json=?, updated_at=? WHERE id=?",
              (db.jdump(data), now(), rec["id"]))

    rname = conv["respondent_name"]
    if rname.startswith("Guest"):
        for guess in ("name", "your_name", "full_name"):
            if data.get(guess):
                rname = str(data[guess])[:60]
                break
    contact_keys = ("contact", "whatsapp", "email", "phone")
    contact = next((str(data[k])[:120] for k in contact_keys if data.get(k)), "")
    done = turn.get("done") or all(
        (data.get(f["key"]) not in ("", None)) for f in fields.values() if f.get("required"))
    status = "complete" if done else "active"
    db.ex("""UPDATE conversations SET summary=?, respondent_name=?, respondent_contact=?,
             status=?, last_at=? WHERE id=?""",
          (str(turn.get("note", ""))[:500], rname, contact, status, now(), conv["id"]))
    return {"reply": reply, "status": status, "respondent_name": rname}


@app.get("/api/public/thread/{session_token}")
def public_thread(session_token: str):
    conv = db.one("SELECT * FROM conversations WHERE session_token=?", (session_token,))
    if not conv:
        fail(404, "Session not found")
    a = db.one("SELECT name, status FROM agents WHERE id=?", (conv["agent_id"],))
    msgs = db.q("SELECT role, text, created_at FROM messages WHERE conversation_id=? ORDER BY id",
                (conv["id"],))
    return {"status": conv["status"], "agent_name": a["name"] if a else "",
            "respondent_name": conv["respondent_name"],
            "messages": [{"role": ("user" if m["role"] == "user" else "agent"),
                          "text": m["text"], "created_at": m["created_at"]} for m in msgs]}


# ================================================================ SPA + PWA static serving

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

MEDIA = {".html": "text/html", ".js": "text/javascript", ".css": "text/css",
         ".webmanifest": "application/manifest+json", ".png": "image/png",
         ".svg": "image/svg+xml", ".ico": "image/x-icon", ".json": "application/json"}


@app.get("/{full_path:path}")
def spa(full_path: str):
    if full_path.startswith("api/"):
        fail(404, "Unknown API route")
    candidate = (STATIC_DIR / full_path).resolve()
    if (full_path and candidate.is_file()
            and str(candidate).startswith(str(STATIC_DIR.resolve()))):
        return FileResponse(candidate, media_type=MEDIA.get(candidate.suffix, "application/octet-stream"))
    return FileResponse(STATIC_DIR / "index.html", media_type="text/html")
