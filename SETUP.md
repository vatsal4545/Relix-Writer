# Setup from the zip — Relix the Writer

Quick-start for reviewers who unzipped the codebase (no git clone needed).
**Total time: ~5 minutes** if Docker, Python, and Node are already installed.

## 1. Prerequisites

| Tool | Min version | Check |
| --- | --- | --- |
| Docker Desktop | running | `docker info` |
| Python | 3.10+ | `python3 --version` |
| Node.js | 18+ | `node --version` |
| Anthropic API key | — | https://console.anthropic.com |

If any are missing:
- macOS: `brew install --cask docker` · `brew install python@3.11 node`
- Windows/Linux: see the official installer pages

## 2. Unzip and enter

```bash
unzip relix-writer.zip
cd relix-writer
```

## 3. Configure your Anthropic API key

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` in any editor and replace the placeholder with your key:

```
DATABASE_URL=postgresql+psycopg://relix:relix_dev_password@localhost:5432/relix
ANTHROPIC_API_KEY=sk-ant-your-key-here   <-- paste here
```

> **Heads up**: the backend will refuse to start if `ANTHROPIC_API_KEY` is missing or invalid.

## 4. Start Postgres (Docker)

```bash
docker compose up -d
```

This boots Postgres 16 on `localhost:5432` with the credentials baked into
`docker-compose.yml`. Data persists in a Docker named volume across restarts.

Verify it came up:

```bash
docker compose ps    # should show 'relix-postgres' as 'running'
```

## 5. Backend

```bash
cd backend
python3 -m venv venv

# Activate the venv:
source venv/bin/activate                # macOS/Linux
# .\venv\Scripts\Activate.ps1           # Windows PowerShell

pip install -r requirements.txt
python init_db.py                       # creates the 6 tables
python app.py                           # runs on http://localhost:5050
```

You should see:
```
 * Running on http://127.0.0.1:5050
```

Leave this terminal running.

> **macOS note:** port 5050 is used instead of the conventional 5000 because
> macOS Monterey+ binds 5000 to AirPlay Receiver. If you need a different
> port, run `PORT=5001 python app.py` and update step 6 accordingly.

## 6. Frontend (new terminal)

```bash
cd frontend
npm install
npm run dev                             # runs on http://localhost:5173
```

You should see:
```
  ➜  Local:   http://localhost:5173/
```

If you changed the backend port in step 5, also edit
`frontend/vite.config.ts` so the `/api` proxy points to the right port.

## 7. Use it

Open **http://localhost:5173** in a browser. You'll land on the signup
wizard. Fill in name, email, password, and the company "Brain" fields —
those values feed into the agent's system prompt so it never asks
redundant questions.

After signup you'll see the **Planner**: chat on the left, blog idea
cards on the right. Try:

> "Give me 3 blog ideas about [your topic]."

Watch the cards appear live as the agent calls `create_content_idea`.
Click *Start session* on any card → discuss the plan → ask Relix to write
the post. Both the plan and the final content are editable.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `cannot import name 'db' from 'extensions'` | `backend/extensions.py` was emptied somehow. It should contain exactly `from flask_sqlalchemy import SQLAlchemy` then `db = SQLAlchemy()`. |
| Anthropic returns 404 `model: ...` | Your account doesn't have access to `claude-sonnet-4-5-20250929`. List available models: `python -c "from anthropic import Anthropic; [print(m.id) for m in Anthropic().models.list().data]"` then update the `MODEL` constant in `backend/agent/runner.py` (and the model string in `execute_plan` inside `backend/agent/tools.py`). |
| `curl localhost:5000` returns `HTTP 403 AirTunes` (macOS) | That's AirPlay Receiver. Use 5050 (our default) or disable it in System Settings → General → AirDrop & Handoff. |
| Frontend loads but `/api/me` returns 401 every time | Cookie issue. Make sure you're on `http://localhost:5173` (not 127.0.0.1) and that you signed up via the browser, not via curl. |
| `docker compose up` fails with "port already in use" | Something else is on 5432. Either stop it (`brew services stop postgresql`) or change the host port in `docker-compose.yml`. |
| `npm install` errors about Node version | Upgrade to Node 18+. We use Vite 5 which requires it. |
| Plan/content not updating live during chat | Check the browser devtools Network tab. The SSE response (`/api/planner/chat` or `/api/sessions/:id/chat`) should be `Content-Type: text/event-stream` and stay open while the agent works. |

## Stopping everything

```bash
# In the frontend terminal:  Ctrl+C
# In the backend terminal:   Ctrl+C
# Stop Postgres:
docker compose down                     # keeps data
docker compose down -v                  # wipes data (deletes the volume)
```

## What to read next

- [README.md](README.md) — feature overview, API surface, project layout
- [ARCHITECTURE.md](ARCHITECTURE.md) — design rationale, agent-loop walkthrough, defense Q&A
