"""AI layer — every call goes to Gemini (Google AI Studio) REST API.

Key resolution: the user's own key (set in Settings) → the server key
(DARIUS_SERVER_AI_KEY). With neither, ops raise AIUnavailable and the affected
features pause with a clear message.
"""
import json
import re

import httpx

import config


class AIUnavailable(Exception):
    pass


# ---------------------------------------------------------------- key resolution

def resolve_key(user: dict | None) -> str | None:
    if user:
        k = (user.get("gemini_key") or "").strip()
        if k:
            return k
    return config.SERVER_GEMINI_KEY or None


# Google retires Gemini models over time. Old saved values are transparently
# mapped to their current replacements so existing accounts keep working.
LEGACY_MODELS = {
    "gemini-2.5-flash": "gemini-3.5-flash",
    "gemini-2.5-flash-lite": "gemini-3.5-flash-lite",
    "gemini-2.5-pro": "gemini-3.5-flash",
    "gemini-2.0-flash": "gemini-3.5-flash",
    "gemini-2.0-flash-lite": "gemini-3.5-flash-lite",
    "gemini-1.5-flash": "gemini-3.5-flash",
    "gemini-1.5-pro": "gemini-3.5-flash",
}


def resolve_model(user: dict | None) -> str:
    m = ((user or {}).get("model") or "").strip()
    return LEGACY_MODELS.get(m, m or config.DEFAULT_MODEL)


def _extract_json(text: str):
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    for open_ch, close_ch in (("{", "}"), ("[", "]")):
        start = text.find(open_ch)
        end = text.rfind(close_ch)
        if start != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                continue
    raise AIUnavailable("AI returned unparseable output")


def generate(key: str, model: str, system: str, user: str, temp: float = 0.7,
             json_mode: bool = True) -> str:
    payload = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {"temperature": temp, "maxOutputTokens": 4096},
    }
    if json_mode:
        payload["generationConfig"]["responseMimeType"] = "application/json"
    try:
        r = httpx.post(
            f"{config.GEMINI_BASE}/{model}:generateContent",
            headers={"x-goog-api-key": key, "Content-Type": "application/json"},
            json=payload,
            timeout=90,
        )
    except httpx.HTTPError as e:
        raise AIUnavailable(f"Gemini unreachable: {e.__class__.__name__}")
    if r.status_code == 400 and "API key not valid" in r.text:
        raise AIUnavailable("Invalid Gemini API key — check Settings")
    if r.status_code == 400 and "location is not supported" in r.text:
        raise AIUnavailable("Gemini is not available from this server's region — "
                            "deploy in a supported region (US/EU)")
    if r.status_code in (401, 403):
        raise AIUnavailable("Gemini rejected the API key (403) — check permissions/billing")
    if r.status_code == 429:
        raise AIUnavailable("Gemini free-tier limit hit (429) — try again shortly, "
                            "or switch model in Settings")
    if r.status_code in (404, 503):
        try:
            detail = str((r.json().get("error") or {}).get("message") or "").strip()
        except (ValueError, AttributeError):
            detail = ""
        if r.status_code == 503:
            raise AIUnavailable("Gemini is busy right now (503) — try again in a moment")
        raise AIUnavailable(detail or "That Gemini model is unavailable — pick another in Settings")
    if r.status_code >= 400:
        raise AIUnavailable(f"Gemini error {r.status_code}")
    data = r.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError):
        raise AIUnavailable("Gemini returned an empty response")


def generate_json(key, model, system, user, temp=0.7):
    return _extract_json(generate(key, model, system, user, temp, json_mode=True))


class Ctx:
    """Resolved AI context: whose Gemini key and model a call runs on."""

    def __init__(self, user: dict | None):
        self.key = resolve_key(user)
        self.model = resolve_model(user)
        if not self.key:
            raise AIUnavailable(
                "No Gemini key configured — set DARIUS_SERVER_AI_KEY on the server, "
                "or add your own Google AI Studio key in Settings.")

    def json(self, system: str, user: str, temp: float = 0.7):
        return generate_json(self.key, self.model, system, user, temp)


def test_key(key: str, model: str) -> bool:
    return generate(key, model, "You are a health check.", "Reply with the single word OK",
                    temp=0.0, json_mode=False).strip().upper().startswith("OK")


# ---------------------------------------------------------------- shared helpers

def _fields(agent: dict) -> list:
    import db
    return db.jload(agent.get("schema_json"), {}).get("fields", [])


def _computeds(agent: dict) -> list:
    import db
    return db.jload(agent.get("logic_json"), {}).get("computed", [])


def coerce_value(raw, field: dict):
    """Leniently coerce an extracted value to the field's declared type."""
    t = field.get("type", "text")
    if raw is None:
        return None
    if t == "number":
        if isinstance(raw, (int, float)):
            return raw
        m = re.search(r"-?[\d,]+(?:\.\d+)?", str(raw).replace(",", ""))
        return float(m.group()) if m else str(raw)
    if t == "boolean":
        if isinstance(raw, bool):
            return raw
        return str(raw).strip().lower() in ("true", "yes", "y", "1", "correct")
    if t == "multiselect":
        if isinstance(raw, list):
            return [str(x) for x in raw]
        return [str(raw)]
    return str(raw)


# ---------------------------------------------------------------- 1. agent draft

DRAFT_SYSTEM = """You design conversational data-collection agents for Darius, a consumer app.
Given an agent name and the owner's brief, design the agent.

Return JSON:
{
  "personality": "2-3 sentences, warm and human, written as instructions for the agent ('You are ... , you speak like ...')",
  "opening_message": "1-2 friendly lines the agent opens with (no questions yet, no rigid form-speak)",
  "fields": [
    {"key": "snake_case", "label": "Human label", "type": "text|number|date|select|multiselect|boolean",
     "description": "what to ask or listen for, phrased for a conversation",
     "required": true, "options": ["only for select/multiselect", "..."]}
  ],
  "computeds": [
    {"key": "snake_case", "label": "Column label", "options": ["2-4 short qualitative values"],
     "rule": "natural-language condition referencing field keys, e.g. 'hot if urgency is high and budget above 100000; cold if just browsing'"}
  ]
}

Rules: 5-9 fields, at most 3 required; 0-3 computeds; keys lowercase snake_case;
qualitative over bureaucratic — the owner is a normal person, not a corporation.
Always make the FIRST field a required text field with key "name" and label "Name" so
records can address people by name instead of a guest number."""


def draft_agent(ctx: Ctx, name: str, brief: str) -> dict:
    out = ctx.json(DRAFT_SYSTEM, f"Agent name: {name}\nOwner's brief: {brief}")
    out.setdefault("fields", [])
    out.setdefault("computeds", [])
    out.setdefault("personality", "")
    out.setdefault("opening_message", "")
    # Keep records human-readable even if the model forgets the name field.
    if not any(str(f.get("key", "")).lower() in ("name", "your_name", "full_name")
               for f in out["fields"] if isinstance(f, dict)):
        out["fields"].insert(0, {
            "key": "name", "label": "Name", "type": "text",
            "description": "The person's name, as they introduce themselves",
            "required": True, "options": [],
        })
    return out


# ---------------------------------------------------------------- 2. interview turn

INTERVIEW_SYSTEM = """You run ONE 1:1 conversation for a Darius agent — a semi-structured
interview that feels like friendly chat, never a form.

PERSONA: {persona}

YOUR JOB: chat naturally and quietly fill the DATA SCHEMA as the person talks.

HARD RULES:
- ONE question at a time; weave it into the conversation, adapt order freely.
- NEVER ask about a field that already has a value. Never repeat a question.
- React like a human first ("Nice!", "Ah, that makes sense") before the next ask.
- Only extract what the person actually said — NEVER invent or guess data.
- Track yourself in "note": comma-separated field keys you have already asked about.
- If EVERY required field has a value → set "done": true and close warmly in one short line.
- {disclosure}
- Reply ONLY with JSON: {"reply": "...", "updates": {"field_key": extracted_value}, "done": false, "note": "asked,keys"}

The "reply" is what the person reads. Keep it short (1-3 sentences)."""


def interview_turn(ctx: Ctx, agent: dict, record_data: dict, note: str,
                   history: list[dict], last_user_text: str) -> dict:
    fields = _fields(agent)
    disclosure = ("The agent has disclosed it is an AI assistant collecting information for its "
                  "owner; stay transparent if asked.") if agent.get("disclose_ai") else ""
    filled = {k: v for k, v in record_data.items() if v not in ("", None, [], {})}
    missing = [f["key"] for f in fields if f.get("required") and not filled.get(f["key"])]
    user_msg = (
        f"SCHEMA FIELDS: {json.dumps(fields, ensure_ascii=False)}\n"
        f"CURRENT VALUES: {json.dumps(filled, ensure_ascii=False)}\n"
        f"MISSING REQUIRED: {json.dumps(missing)}\n"
        f"NOTE (already asked): {note or 'nothing yet'}\n"
        f"CONVERSATION SO FAR (oldest last):\n"
        + "\n".join(f"{m['role'].upper()}: {m['text']}" for m in history)
        or "(conversation just started)"
    )
    # brace-safe substitution (the template contains JSON braces — no str.format)
    sys_prompt = (INTERVIEW_SYSTEM
                  .replace("{persona}", agent.get("personality")
                           or f"You are {agent['name']}'s assistant.")
                  .replace("{disclosure}", disclosure))
    out = ctx.json(sys_prompt, user_msg, temp=0.8)
    return {
        "reply": str(out.get("reply", "")).strip(),
        "updates": out.get("updates") or {},
        "done": bool(out.get("done")),
        "note": str(out.get("note", "")),
    }


# ---------------------------------------------------------------- 3. rule evaluation

RULES_SYSTEM = """You evaluate computed columns for Darius records.
You get the computed column definitions (qualitative rules) and a batch of records.
For each record and each computed column, decide the value by its rule, using ONLY the
record's data. When a rule clearly maps to one of the column's options, use that exact
option value. Never invent new option names.
Return JSON: [{"id": <record id>, "computed": {"<column key>": "<value>"}}]"""


def evaluate_rules(ctx: Ctx, agent: dict, items: list[dict]) -> dict[int, dict]:
    computeds = _computeds(agent)
    if not computeds or not items:
        return {}
    results: dict[int, dict] = {}
    for i in range(0, len(items), 20):
        batch = items[i : i + 20]
        user_msg = (
            f"COMPUTED COLUMNS: {json.dumps(computeds, ensure_ascii=False)}\n"
            f"RECORDS: {json.dumps(batch, ensure_ascii=False)}"
        )
        out = ctx.json(RULES_SYSTEM, user_msg, temp=0.2)
        for row in out if isinstance(out, list) else []:
            try:
                results[int(row["id"])] = row.get("computed") or {}
            except (KeyError, TypeError, ValueError):
                continue
    return results


# ---------------------------------------------------------------- 4. NL query (semantic zoom)

QUERY_SYSTEM = """You are the query engine of Darius: the operator asks a natural-language
question about the collected records; you decide which records genuinely match the INTENT.
Match loosely and semantically, not by exact words. If nothing matches, return [].
Return JSON: {"ids": [<record ids>], "segment": "3-5 word name for this slice",
"rationale": "one sentence explaining the match"}"""


def answer_query(ctx: Ctx, agent: dict, rows: list[dict], question: str) -> dict:
    user_msg = (f"RECORDS: {json.dumps(rows, ensure_ascii=False)}\n"
                f"OPERATOR'S QUESTION: {question}")
    out = ctx.json(QUERY_SYSTEM, user_msg, temp=0.2)
    ids = []
    for v in out.get("ids") or []:
        try:
            ids.append(int(v))
        except (TypeError, ValueError):
            continue
    return {"ids": ids, "segment": str(out.get("segment", "matches")),
            "rationale": str(out.get("rationale", ""))}


# ---------------------------------------------------------------- 5+6. compose: refined / delegate

REFINE_SYSTEM = """You personalise a message for several recipients of a Darius agent.
You get the operator's base message and, per recipient, their name and context (what they
said in their own 1:1 chat with the agent). Rewrite the base message for each recipient so
it feels personally written to them — keep the base intent and any facts/numbers EXACTLY,
only adapt the framing, greeting and reference to their situation. 1-3 sentences, warm,
human, no generic fluff. Never promise anything the base message doesn't.
Return JSON: [{"id": <id>, "text": "..."}]"""

DELEGATE_SYSTEM = """You draft replies on behalf of a Darius agent's owner.
The owner gives one instruction (e.g. "tell everyone asking about pricing my fee is 50k").
For each recipient you get their name and context from their own 1:1 chat. Draft the reply
the owner would send THAT person: personalised, natural, short, answering their actual
situation while honouring the instruction. Never invent facts beyond the instruction and
their context.
Return JSON: [{"id": <id>, "text": "..."}]"""


def personalized_batch(ctx: Ctx, agent: dict, base_text: str, items: list[dict]) -> dict[int, str]:
    out = {}
    for i in range(0, len(items), 30):
        batch = items[i : i + 30]
        user_msg = (f"AGENT: {agent['name']}\nBASE MESSAGE: {base_text}\n"
                    f"RECIPIENTS: {json.dumps(batch, ensure_ascii=False)}")
        rows = ctx.json(REFINE_SYSTEM, user_msg, temp=0.7)
        for row in rows if isinstance(rows, list) else []:
            try:
                out[int(row["id"])] = str(row.get("text", "")).strip()
            except (KeyError, TypeError, ValueError):
                continue
    return out


def delegated_batch(ctx: Ctx, agent: dict, instruction: str, items: list[dict]) -> dict[int, str]:
    out = {}
    for i in range(0, len(items), 20):
        batch = items[i : i + 20]
        user_msg = (f"AGENT: {agent['name']}\nOWNER'S INSTRUCTION: {instruction}\n"
                    f"RECIPIENTS (id, name, context of their own chat): "
                    f"{json.dumps(batch, ensure_ascii=False)}")
        rows = ctx.json(DELEGATE_SYSTEM, user_msg, temp=0.7)
        for row in rows if isinstance(rows, list) else []:
            try:
                out[int(row["id"])] = str(row.get("text", "")).strip()
            except (KeyError, TypeError, ValueError):
                continue
    return out
