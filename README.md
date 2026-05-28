# Relix the Writer

An AI content-writing agent. Chat with Relix in a planner workspace to
brainstorm blog ideas, then open a session for any idea to refine a plan
and have Relix execute the full blog post — all driven by the same
streaming agentic loop.

---

## Table of contents

1. [What's in the box](#whats-in-the-box)
2. [Stack](#stack)
3. [Prerequisites](#prerequisites)
4. [Setup — from a ZIP file](#setup--from-a-zip-file)
   - [macOS / Linux](#macos--linux--zip)
   - [Windows (PowerShell)](#windows-powershell--zip)
5. [Setup — from GitHub](#setup--from-github)
   - [macOS / Linux](#macos--linux--github)
   - [Windows (PowerShell)](#windows-powershell--github)
6. [Using the app](#using-the-app)
7. [Stopping everything](#stopping-everything)
8. [Project layout](#project-layout)
9. [How a chat message becomes a card](#how-a-chat-message-becomes-a-card-the-core-flow)
10. [API surface](#api-surface)
11. [SSE event types](#sse-event-types)
12. [Tools available to the agent](#tools-available-to-the-agent)
13. [Troubleshooting](#troubleshooting)

---

## What's in the box

- **Planner workspace** — chat on the left, blog idea cards on the right. Ideas appear live as the agent creates them (SSE-driven).
- **Sessions** — open any idea, refine a markdown plan with the agent, then have it write the full post. Plan and content tabs are both manually editable.
- **The Brain** — signup captures company / industry / audience / voice. Every agent call gets this injected as system context.
- **Tool-use chips in chat** — `Creating blog idea`, `Writing plan`, `Searching the web`, etc. with running/done/error states.
- **Message DNA** — every assistant response has an `ⓘ DNA` badge showing what informed it: brain fields, prior messages, tools called, artifacts referenced.
- **Stop button** — cancel an in-flight agent response mid-stream.
- **Delete** — remove blog idea cards or individual sessions (cascades cleanly).
- **Web search** — Anthropic's built-in `web_search_20250305` tool, wired into both planner and session chats.
- **Token-by-token streaming** with automatic retry on transient Anthropic errors (529 / 5xx / rate limits).

## Stack

- **Backend** — Python 3.10+, Flask, SQLAlchemy, Postgres (Docker), Anthropic SDK direct (no Langchain), Server-Sent Events for streaming.
- **Frontend** — Vite + React 18 + TypeScript, React Query, react-router, react-markdown.
- **Model** — `claude-sonnet-4-5-20250929` (override in `backend/agent/runner.py`).

## Prerequisites

| Tool | Min version | Check command |
| --- | --- | --- |
| Docker Desktop (running) | latest | `docker info` |
| Python | 3.10+ | `python3 --version` (Windows: `python --version`) |
| Node.js | 18+ | `node --version` |
| Anthropic API key | — | https://console.anthropic.com |

If anything is missing:

- **macOS:** `brew install --cask docker` · `brew install python@3.11 node`
- **Windows:** install from the official installer pages
  - Docker Desktop: <https://www.docker.com/products/docker-desktop>
  - Python: <https://www.python.org/downloads/> (tick *"Add python.exe to PATH"*)
  - Node.js: <https://nodejs.org/>
- **Linux:** use your distro's package manager

---

## Setup — from a ZIP file

> Use this path if you received `relix-writer.zip` and want to skip git entirely.

### macOS / Linux — ZIP

Open a Terminal. Copy and paste each block in order.

**1. Unzip and enter the folder**

```bash
unzip relix-writer.zip
cd relix-writer
```

**2. Configure your Anthropic API key**

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` in any editor and paste your key:

```env
DATABASE_URL=postgresql+psycopg://relix:relix_dev_password@localhost:5432/relix
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**3. Start Postgres**

```bash
docker compose up -d
docker compose ps      # should show 'relix-postgres' running
```

**4. Backend (leave this terminal running)**

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python init_db.py
python app.py
```

You should see `* Running on http://127.0.0.1:5050`.

**5. Frontend (open a NEW terminal)**

```bash
cd relix-writer/frontend
npm install
npm run dev
```

Open <http://localhost:5173> in your browser.

---

### Windows (PowerShell) — ZIP

Open **Windows PowerShell** (not cmd). Copy and paste each block in order.

**1. Unzip and enter the folder**

```powershell
Expand-Archive .\relix-writer.zip -DestinationPath .
cd .\relix-writer
```

**2. Configure your Anthropic API key**

```powershell
Copy-Item backend\.env.example backend\.env
notepad backend\.env
```

Paste your key into the file, save, and close Notepad:

```env
DATABASE_URL=postgresql+psycopg://relix:relix_dev_password@localhost:5432/relix
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**3. Start Postgres**

```powershell
docker compose up -d
docker compose ps
```

**4. Backend (leave this terminal running)**

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python init_db.py
python app.py
```

> **PowerShell execution policy error?** Run once as admin:
> `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

You should see `* Running on http://127.0.0.1:5050`.

**5. Frontend (open a NEW PowerShell window)**

```powershell
cd relix-writer\frontend
npm install
npm run dev
```

Open <http://localhost:5173> in your browser.

---

## Setup — from GitHub

> Use this path if you want to clone the repo and pull future updates.

### macOS / Linux — GitHub

Open a Terminal.

**1. Clone**

```bash
git clone https://github.com/vatsal4545/Relix-Writer.git relix-writer
cd relix-writer
```

**2. Configure your Anthropic API key**

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and paste your key (same content as the ZIP path above).

**3. Start Postgres**

```bash
docker compose up -d
docker compose ps
```

**4. Backend (leave this terminal running)**

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python init_db.py
python app.py
```

**5. Frontend (open a NEW terminal)**

```bash
cd relix-writer/frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

---

### Windows (PowerShell) — GitHub

Open **Windows PowerShell**.

**1. Clone**

```powershell
git clone https://github.com/vatsal4545/Relix-Writer.git relix-writer
cd .\relix-writer
```

**2. Configure your Anthropic API key**

```powershell
Copy-Item backend\.env.example backend\.env
notepad backend\.env
```

Paste your key, save, close.

**3. Start Postgres**

```powershell
docker compose up -d
docker compose ps
```

**4. Backend (leave this terminal running)**

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python init_db.py
python app.py
```

**5. Frontend (open a NEW PowerShell window)**

```powershell
cd relix-writer\frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

---

## Using the app

1. Sign up at <http://localhost:5173>. The wizard captures the **Brain**:
   company name, what the company does, industry, target audience, brand voice. These flow into every agent call so Relix never asks redundant questions.
2. On the **Planner** page, try:
   > *"Give me 3 blog ideas about [your topic]."*
   Watch the cards appear live as the agent calls `create_content_idea`.
3. Click **Start session** on any card. Inside a session you can:
   - Discuss the plan in chat.
   - Ask Relix to draft the plan (writes to the **Plan** tab).
   - Ask Relix to write the post (writes to the **Content** tab).
   - Edit either tab manually at any time.
4. Hover any blog idea card or session row to reveal the **×** delete button.
5. While Relix is responding, the Send button becomes a red **Stop** button — click to cancel mid-stream.

### Why port 5050?

macOS Monterey+ binds port 5000 to AirPlay Receiver, so the backend
defaults to **5050**. To override:

- macOS/Linux: `PORT=5001 python app.py`
- Windows: `$env:PORT=5001; python app.py`

If you change the port, update `frontend/vite.config.ts` so the `/api`
proxy points to the new one.

---

## Stopping everything

In each terminal, press **Ctrl+C** to stop the backend / frontend.

Then stop Postgres:

```bash
docker compose down          # keeps your data in the Docker volume
docker compose down -v       # wipes all data
```

---

## Project layout

```
relix-writer/
├── docker-compose.yml           # Postgres 16
├── backend/
│   ├── app.py                   # composition root: create_app()
│   ├── extensions.py            # `db = SQLAlchemy()` singleton
│   ├── models.py                # User, Planner, BlogIdea, Session, Message, Artifact
│   ├── init_db.py               # standalone schema bootstrap
│   ├── auth/routes.py           # signup/login/logout/me, cookie auth
│   ├── planner/routes.py        # GET planner, GET messages, POST chat (SSE), DELETE blog_ideas/:id
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
    │   ├── Session/             # PlanTab, ContentTab, SessionsSidebar
    │   └── TopBar.tsx
    └── pages/                   # Signup, Login, Planner, Session
```

---

## How a chat message becomes a card (the core flow)

1. User types into `ChatPanel` → `useAgentStream` POSTs to `/api/planner/chat`.
2. Flask opens an SSE response and calls `agent.runner.run_agent(...)` as a generator.
3. Runner saves the user message, builds the messages array (history + new), and the system prompt with the Brain injected.
4. Runner opens a **streaming** Anthropic call (with automatic retry on transient errors). For each content block:
   - `text` → tokens stream out as `text` SSE events.
   - `tool_use` → SSE `tool_use_start` + `tool_use_input`, dispatch to `execute_tool()`, SSE `tool_result`, then SSE `artifact_update` if the tool created persistent state.
5. If `stop_reason == tool_use`, the runner appends tool_result blocks and loops. Otherwise it emits `done` with `context_used` (the Message DNA payload).
6. The frontend listens to `artifact_update` and invalidates the relevant React Query key, so the workspace refetches and the new card appears.

---

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
| DELETE | `/api/planner/blog_ideas/:id` | Cascades sessions + messages + artifacts |
| POST | `/api/sessions` | Body `{blog_idea_id}` |
| GET  | `/api/sessions` | Sidebar list |
| GET  | `/api/sessions/:id` | Session + messages + artifacts |
| PATCH | `/api/sessions/:id` | Manual edits to plan/content/status |
| DELETE | `/api/sessions/:id` | Cascades messages + artifacts |
| POST | `/api/sessions/:id/chat` | **SSE** — streams agent reply |
| GET  | `/api/messages/:id/dna` | Human-readable Message DNA |

## SSE event types

`text` · `tool_use_start` · `tool_use_input` · `tool_result` · `artifact_update` · `done` · `error`

Each frame: `event: <name>\ndata: <json>\n\n`.

## Tools available to the agent

- `create_content_idea` (planner only) — adds a card.
- `update_content_plan` (session only) — writes to `sessions.plan`.
- `execute_plan` (session only) — runs a separate Anthropic call to expand the plan into full markdown content.
- `find_trending_topics` — guidance wrapper that nudges the model toward `web_search`.
- `web_search` — Anthropic's built-in server-side tool.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `cannot import name 'db' from 'extensions'` | `backend/extensions.py` should contain `from flask_sqlalchemy import SQLAlchemy` and `db = SQLAlchemy()`. |
| Anthropic returns `404 model: ...` | Your account doesn't have access to `claude-sonnet-4-5-20250929`. List your models: `python -c "from anthropic import Anthropic; [print(m.id) for m in Anthropic().models.list().data]"` then update `MODEL` in `backend/agent/runner.py` (and the model id inside `execute_plan` in `backend/agent/tools.py`). |
| Anthropic returns `529 overloaded` | The runner already retries with exponential backoff. If it persists, check <https://status.anthropic.com>. |
| `curl localhost:5000` returns `HTTP 403 AirTunes` (macOS) | That's AirPlay Receiver. Use 5050 (the default), or disable it in System Settings → General → AirDrop & Handoff. |
| Frontend loads but `/api/me` returns 401 every time | Cookie issue. Use `http://localhost:5173` (not 127.0.0.1) and sign up via the browser. |
| `docker compose up` fails with "port already in use" | Something else is on 5432. Either stop it (`brew services stop postgresql`, or `net stop postgresql-x64-...` on Windows) or change the host port in `docker-compose.yml`. |
| `npm install` errors about Node version | Upgrade to Node 18+. Vite 5 requires it. |
| Plan/content not updating live during chat | Check DevTools → Network. The SSE response (`/api/planner/chat` or `/api/sessions/:id/chat`) should be `Content-Type: text/event-stream` and stay open while the agent works. |
| Windows: `.\venv\Scripts\Activate.ps1` blocked by execution policy | Run once: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`. |
| Windows: `docker compose` not found | Open Docker Desktop and make sure it's running. The CLI ships with Docker Desktop. |
