# Darius — Feature Digest & Flow Definitions

> One-line pitch: **Darius lets anyone spawn conversational agents that interview people at scale
> and pour their answers into a living, queryable spreadsheet — then talk back.**

Core primitive: **conversation as data acquisition**. Everything below hangs off the loop
`collect → structure → query → act → respond`.

---

## Part 1 — Feature digest (every feature, what / why / how)

### F1. Agent spawning
- **What:** user creates an agent, gives it a name, personality and opening line, and gets a shareable link (`/c/{slug}`) for their Instagram bio, WhatsApp status, anywhere.
- **Why:** the agent is the outward face — it must feel like *the owner*, not a form.
- **How:** `POST /api/agents`; agent has `personality` (persona prompt), `opening_message`, `disclose_ai` flag. Public link always live while status = `live`.

### F2. Schema definition (the semi-structured interview)
- **What:** the owner describes, in plain language, the data they want collected. Darius drafts a schema: fields with `label, key, type (text|number|date|select|multiselect|boolean), description (what to ask / look for), required, options`. Fully editable.
- **Why:** the schema is the underrated core — it is the "net" that classifies every fish.
- **How:** `POST /api/agents/{id}/generate-schema` turns a free-text brief into a schema draft + suggested persona + opening message; Setup tab has a field editor (add / edit / reorder / delete). Stored as `schema_json` on the agent.

### F3. Autonomous interviewing
- **What:** respondents open the link and get a 1:1 conversation. The agent asks one thing at a time, naturally, like a person doing a semi-structured interview — flexible with order, follows tangents, circles back.
- **Why:** this is the outward "net". Quality of conversation = completion rate.
- **How:** `POST /api/public/message` → one Gemini call returns strict JSON `{reply, updates, done, note}` — the reply plus any schema fields extracted so far. Required-field tracking decides wrap-up. Respondents resume their own thread via a session token in `localStorage`.

### F4. Structuring / extraction (chat → database)
- **What:** every respondent message gets parsed into schema-shaped values immediately; the result is a record — "a database full of information" built from thousands of casual chats.
- **Why:** the operator never reads raw transcripts to get facts; the table is always live.
- **How:** the interview call returns `updates` which are type-coerced (number stays number, boolean stays boolean) and merged into `records.data_json`. Respondent can reopen a "complete" chat; extraction resumes.

### F5. The intelligent spreadsheet (computed logic)
- **What:** schema behaves like a spreadsheet with programmable columns: qualitative conditional logic, e.g. *"hot if urgency is high AND budget ≥ ₦100k; cold if just browsing"* → a computed field with values `hot|warm|cold`.
- **Why:** classification at the top of the funnel is what makes zooming possible.
- **How:** Setup tab has a **Logic editor** (computed columns: label, options, NL rule). `POST /api/agents/{id}/recompute` evaluates rules for all records in batched Gemini calls; results stored in `records.computed_json`, shown as sticker chips in the table. Operators can also hand-edit any cell.

### F6. Natural-language query — the semantic zoom
- **What:** the operator asks the whole database anything: *"show me urgent leads who mentioned budget"* → matching rows highlight, the rest dim. Zoom levels: **all → segment → one person**.
- **Why:** low articulatory distance — filters as rich as plain language allows.
- **How:** `POST /api/agents/{id}/query` sends compact records + question, gets `{matching_ids, segment_name, rationale}` back; UI highlights matches (level-1 zoom) and lets you open a person (level-2). A "clear" returns to level-0. With no key the call fails loudly (503) — nothing is faked.

### F7. Operator override — jump into a booth
- **What:** the operator can enter any specific 1:1 chat and speak as themselves (delivered to the respondent as the agent's voice).
- **Why:** total delegation is wrong for high-stakes moments; humans must be able to step in.
- **How:** Records → row → **Chat drawer** shows the full transcript; operator sends → `POST /api/conversations/{id}/reply`, stored with role `operator`, rendered to the respondent as a normal agent message, highlighted in the operator view.

### F8. Merged view — the unified stream
- **What:** the operator's Inbox shows *all* conversations interleaved into one stream (each message labelled with its respondent), like sitting where every booth's messages arrive. Each respondent still only ever sees their own 1:1.
- **Why:** "communicate with a thousand people at the same time" without a thousand tabs.
- **How:** `GET /api/agents/{id}/stream` merges messages across conversations chronologically; respondent chips filter the stream; every message has "open booth" to jump in (F7).

### F9. Broadcast to filtered segments
- **What:** after a query/filter, compose once and choose **only send to** (all / this segment / selected) or **leave out** specific people.
- **Why:** the act-step of the loop — acting on exactly the slice you found.
- **How:** compose modal with target mode `all|segment|selected` + exclusion list; `POST /api/agents/{id}/compose` appends the message to every target conversation. Completed conversations reopen so respondents see it when they return.

### F10. Raw vs refined sends
- **What:** the same compose action can send **raw** (identical text to everyone in the segment) or **refined** (AI rewrites per recipient, personalised to their context).
- **Why:** one person writes once; a thousand people each feel personally addressed.
- **How:** compose `mode: raw | refined`; refined runs a batched Gemini call producing one personalised variant per recipient. Every send logged in **Broadcasts**.

### F11. Delegated mass response
- **What:** instead of writing the message, the operator gives an instruction — *"everyone asking about pricing, tell them my session fee is ₦50k"* — and the AI drafts an appropriate personalised reply per person from their own conversation context.
- **Why:** replies to common requests shouldn't be typed a thousand times, but shouldn't be copy-paste either.
- **How:** compose `mode: delegate` (instruction instead of base text) → per-recipient drafting with their transcript as context.

### F12. Two-way closure — talking back
- **What:** everything sent (broadcasts, overrides, delegated replies) lands in the respondent's own thread; they come back and answer; the loop restarts.
- **Why:** Darius is a communication tool, not just collection.
- **How:** respondent thread (`GET /api/public/thread`) includes operator/agent messages indistinguishably (to them); new replies flip conversation back to `active` and re-enter extraction.

### F13. Consumer-first
- **What:** no enterprise onboarding, no seat talk — signup with username/password, create an agent in one screen, share a link. The dating-filter, doctor, freelancer use cases are all first-class.
- **How:** the whole UI is one-flow, zero-jargon; schema drafting by plain language, not form-builders.

### F14. Programmable personalities
- **What:** persona is editable free text — tone, vibe, persona quirks ("friendly Lagos photographer's assistant") — plus the opening line respondents see first.
- **How:** `personality` + `opening_message` on the agent, injected as the interview system prompt.

### F15. Transparency & consent (built-in guardrail)
- **What:** every agent opens by disclosing it's an AI assistant collecting information for its owner, and what data is being gathered (toggleable per agent, default **on**).
- **Why:** profiling people covertly is an NDPA-2023 and judges-panel liability; disclosure is both ethical and trust-building.
- **How:** public chat renders a disclosure chip; system prompt mandates the disclosure line when enabled.

### F16. Bring-your-own AI key / server key
- **What:** each user pastes their **Gemini API key from Google AI Studio** in Settings; otherwise the server key (env `DARIUS_SERVER_AI_KEY`, Google AI Studio) is used. Model selectable (default `gemini-2.5-flash`, free tier).
- **How:** `GET/PUT /api/settings`; key resolution per call: *user key → server key → none* (with a clear "no key" state — AI features pause with an explicit 503, there are no mock/demo fallbacks).

### F17. PWA
- **What:** installable on phone/desktop; app shell cached, works offline for browsing the last-seen UI; API always live-networked.
- **How:** `manifest.webmanifest` (icons, theme cream), `sw.js` (shell cache-first, API network-only), responsive layout down to 375 px.

---

## Part 2 — Flows

### Operator journey
```
signup → Dashboard (agent cards)
  → Create agent (name + brief) ──AI──▶ schema draft + persona + opening line
  → Setup tab: edit fields · edit computed logic · set live · copy /c/{slug} link
  → share link (bio / WhatsApp / DMs)
  → Records tab: table fills live · sticker chips for computed status
  → Query bar: "urgent leads with budget" → segment highlights (zoom-in)
  → pick targets (segment / selected / leave out) → Compose
       ├ raw        → same text to the slice
       ├ refined    → AI personalises per person
       └ delegate   → instruction only; AI drafts per person
  → Inbox tab: unified stream · open any booth (override) · reply 1:1
  → respondent replies → conversation reactivates → table updates
```

### Respondent journey
```
open /c/{slug} → disclosure chip ("AI assistant for {owner}…")
  → 1:1 chat · agent asks one thing at a time · answers quietly fill the schema
  → wrap-up when required fields collected ("done")
  → thread sleeps; operator messages (broadcast / override / delegate) land here
  → respondent returns via same device → resumes exact thread → replies → loop
```

### AI call inventory (all Gemini, one entry point in `ai.py`)
| # | Call | Trigger | Output (strict JSON) |
|---|------|---------|----------------------|
| 1 | schema draft | create agent / re-draft | fields + persona + opening |
| 2 | interview turn | every respondent message | reply + field updates + done |
| 3 | rule evaluation | recompute (batched) | computed values per record |
| 4 | NL query | query bar | matching ids + segment name |
| 5 | refined sends | compose=refined (batched) | personalised text per recipient |
| 6 | delegated replies | compose=delegate (batched) | drafted text per recipient |

### Data model (SQLite, monolith)
```
users(id, username, password_hash, display_name, gemini_key, model)
tokens(token, user_id)
agents(id, owner_id, name, slug, brief, personality, opening_message,
       disclose_ai, status[draft|live|paused], schema_json, logic_json)
conversations(id, agent_id, session_token, respondent_name, respondent_contact,
              status[active|complete|archived], summary, last_at)
messages(id, conversation_id, role[agent|user|operator|system], text, broadcast_id)
records(id, agent_id, conversation_id, data_json, computed_json, computed_at)
broadcasts(id, agent_id, text, mode[raw|refined|delegate], instruction,
           targets_json, sent_count)
```
Record row = one conversation = one respondent. Operator messages are delivered into the
respondent's 1:1 thread; the respondent never sees other respondents.
