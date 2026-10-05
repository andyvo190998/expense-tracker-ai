# Expense backend

## First agent

`agent.create_expense_agent()` builds a LangGraph-backed LangChain agent with
`ChatOpenAI`, expense mutation and analytics tools, and `CopilotKitMiddleware`.
It resolves natural-language update/delete targets through database lookup and
requires explicit confirmation before deletion. Construction is on demand, so
importing the module does not require an API key. The system prompt lives in
`agent.py`; a dynamic prompt
adds the current date in `Europe/Berlin` before each model call, before CopilotKit
appends frontend context and tools.

FastAPI exposes that graph over AG-UI at `POST /agents/expense`; its health
endpoint is `GET /agents/expense/health`. Both require an authenticated merchant
session. Start it with:

```bash
uv run --env-file .env uvicorn main:app --reload
```

Point the CopilotKit runtime's remote agent URL at
`http://localhost:8000/agents/expense` and use the agent name `expense_agent`.

Start PostgreSQL and apply the migrations with
`uv run alembic upgrade head`. Put `OPENAI_API_KEY` in the local `backend/.env`
(never commit it). Configure `JWT_SECRET`, `REFRESH_TOKEN_PEPPER`, issuer,
audience, cookie security, and allowed origins as shown in `.env.example`.

Provision the first admin without putting credentials in source control:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_NAME=Administrator ADMIN_PASSWORD='use-a-secret-manager' \
  uv run --env-file .env python -m app.cli.create_admin
```

Creation, lookup, correction, confirmed deletion, exact EUR totals, and grouped
category totals by inclusive date range are implemented. Email/password auth,
rotating refresh cookies, CSRF protection, and strict merchant ownership are
wired across REST and agent tools. Durable conversation persistence is not yet
implemented. Each invocation needs its own message history. The prompt
requests truthful confirmations, but deterministic tests do not prove a live
model will always follow it. Inspect tool results as the authority for saves.

Run offline checks with `uv run pytest` and `uv run ruff check .`. Agent tests
use a scripted model with the real graph, middleware, tool, and a temporary
SQLite database; they do not call OpenAI or modify the development database.
