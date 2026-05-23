# Relix the Writer

An AI content-writing agent. Chat with Relix in a planner workspace to
brainstorm blog ideas, then open a session for any idea to refine a plan
and have Relix execute the full blog post — all driven by the same
streaming agentic loop.

Built for the SellScale eng-3 take-home. See `ARCHITECTURE.md` for the
full design rationale.

## What's in the box

- **Planner workspace** — chat on the left, blog idea cards on the right. Ideas appear live as the agent creates them (SSE-driven).
- **Sessions** — open any idea, refine a markdown plan with the agent, then have it write the full post. Plan and content tabs are both manually editable.
- **The Brain** — signup captures company / industry / audience / voice. Every agent call gets this injected as system context. Relix never asks "what does your company do?"
- **Tool-use chips in chat** — `Creating blog idea`, `Writing plan`, `Searching the web`, etc. with running/done/error states.
- **Message DNA** — every assistant response has an `ⓘ DNA` badge showing exactly what informed it: brain fields, prior messages, tools called, artifacts referenced.
- **Web search** — Anthropic's built-in `web_search_20250305` tool is wired into both planner and session chats.
- **`find_trending_topics`** — agent-callable wrapper around web_search aimed at recent industry news.

## Stack

- **Backend** — Python 3.10+, Flask, SQLAlchemy, Postgres (Docker), Anthropic SDK direct (no Langchain), Server-Sent Events for streaming
- **Frontend** — Vite + React 18 + TypeScript, React Query, react-router, react-markdown
- **Model** — `claude-sonnet-4-5-20250929` (override in `backend/agent/runner.py`)

## Prerequisites

- Docker Desktop running
- Python 3.10+
- Node.js 18+
- An Anthropic API key — https://console.anthropic.com

## Setup

```bash
# 1. Clone & enter
git clone <repo> relix-writer && cd relix-writer

# 2. Configure env
cp backend/.env.example backend/.env
# Edit backend/.env and paste your ANTHROPIC_API_KEY

# 3. Start Postgres
docker compose up -d

# 4. Backend
cd backend
python3 -m venv venv
source venv/bin/activate            # Windows: .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python init_db.py                   # creates 6 tables
python app.py                       # http://localhost:5050

# 5. Frontend (new terminal)
cd frontend
npm install
npm run dev                         # http://localhost:5173
```

Open http://localhost:5173 and walk through the signup flow.

### Why port 5050?
macOS Monterey+ binds port 5000 to AirPlay Receiver, so the backend
defaults to 5050. Override with `PORT=5001 python app.py` if needed.
Vite proxies `/api` to 5050 in `frontend/vite.config.ts`.

## Project layout

```
relix-writer/
├── ARCHITECTURE.md              # design doc — start here
├── docker-compose.yml           # Postgres 16
├── backend/
│   ├── app.py                   # composition root: create_app()
│   ├── extensions.py            # `db = SQLAlchemy()` singleton
│   ├── models.py                # User, Planner, BlogIdea, Session, Message, Artifact
│   ├── init_db.py               # standalone schema bootstrap
│   ├── auth/routes.py           # signup/login/logout/me, cookie auth
│   ├── planner/routes.py        # GET planner, GET messages, POST chat (SSE)
│   ├── sessions/routes.py       # CRUD + chat (SSE) + Message DNA endpoint
│   └── agent/
│       ├── runner.py            # the agentic loop (the heart of the app)
│       ├── tools.py             # tool schemas + execute_tool() dispatcher
│       ├── system_prompts.py    # build_*_system_prompt() with <brain>
│       └── sse.py               # tiny event formatter
└── frontend/src/
    ├── api/                     # client, types
    ├── hooks/
    │   ├── useUser.ts
    │   └── useAgentStream.ts    # SSE consumer — the React side of the loop
    ├── components/
    │   ├── Chat/                # ChatPanel, ToolCallChip, ContextDNAPopover
    │   ├── Planner/             # BlogIdeaCard
    │   ├── Session/             # PlanTab, ContentTab
    │   └── TopBar.tsx
    └── pages/                   # Signup, Login, Planner, Session
```

## How a chat message becomes a card (the core flow)

1. User types into `ChatPanel` → `useAgentStream` POSTs to `/api/planner/chat`.
2. Flask opens an SSE response and calls `agent.runner.run_agent(...)` as a generator.
3. Runner saves the user message, builds the messages array (history + new), and the system prompt with the Brain injected.
4. Runner calls Anthropic with the planner tool catalogue. For each content block:
   - `text` → SSE `text` event (streamed to chat bubble)
   - `tool_use` → SSE `tool_use_start` + `tool_use_input`, dispatch to `execute_tool()`, SSE `tool_result`, then SSE `artifact_update` if the tool created persistent state
5. If Claude's `stop_reason` was `tool_use`, append the tool_result blocks back into messages and loop. Otherwise emit `done` with `context_used` (the Message DNA payload).
6. The frontend listens to `artifact_update` and invalidates the relevant React Query key, so the workspace refetches and the new card appears.

That's the entire agentic architecture. Everything else is plumbing.

## API surface

All endpoints are JSON unless noted. Auth is a `relix_user_id` cookie (HttpOnly, SameSite=Lax) set on signup/login.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/signup` | Creates User + Planner, sets cookie |
| POST | `/api/auth/login` | Email + password |
| POST | `/api/auth/logout` | Clears cookie |
| GET  | `/api/me` | Current user or 401 |
| GET  | `/api/planner` | Planner + blog_ideas |
| GET  | `/api/planner/messages` | Planner-level chat history |
| POST | `/api/planner/chat` | **SSE** — streams agent reply |
| POST | `/api/sessions` | Body `{blog_idea_id}` |
| GET  | `/api/sessions/:id` | Session + messages + artifacts |
| PATCH | `/api/sessions/:id` | Manual edits to plan/content/status |
| DELETE | `/api/sessions/:id` | Cascades messages + artifacts |
| POST | `/api/sessions/:id/chat` | **SSE** — streams agent reply |
| GET  | `/api/messages/:id/dna` | Human-readable Message DNA |

## SSE event types

`text` · `tool_use_start` · `tool_use_input` · `tool_result` · `artifact_update` · `done` · `error`

Each frame: `event: <name>\ndata: <json>\n\n`.

## Tools available to the agent

- `create_content_idea` (planner only) — adds a card
- `update_content_plan` (session only) — writes to `sessions.plan`
- `execute_plan` (session only) — runs a separate Anthropic call to expand the plan into full markdown content
- `find_trending_topics` — guidance wrapper that nudges the model toward `web_search`
- `web_search` — Anthropic's built-in server-side tool

## Database

Six tables. See `backend/models.py` for the schema. JSON columns are
`JSONB` on Postgres so `context_used`, `tool_input`, `tool_output`, and
`keywords` are indexable.

## Troubleshooting

- **`extensions` import error on startup** — make sure `backend/extensions.py` contains `db = SQLAlchemy()` (an empty file will silently break imports).
- **Anthropic 404 "model: ..." error** — the hardcoded model id in `backend/agent/runner.py` isn't available on your account. List your models with `python -c "from anthropic import Anthropic; [print(m.id) for m in Anthropic().models.list().data]"` and pick a Sonnet/Opus model you have access to.
- **Port 5000 returns 403** — that's macOS AirPlay Receiver. Backend uses 5050 by default; either keep using 5050 or disable AirPlay Receiver in System Settings → General → AirDrop & Handoff.
- **Frontend can't talk to backend** — Vite proxies `/api` to `http://localhost:5050`. If you changed the backend port, update `frontend/vite.config.ts`.

## Architecture deep-dive

See `ARCHITECTURE.md` for the full design rationale, defense prep, and
phase-by-phase build plan.
