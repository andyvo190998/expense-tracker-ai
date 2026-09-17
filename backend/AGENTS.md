# Backend Instructions

Scope: all files under `backend/`.

## Stack
- Python
- FastAPI
- SQLAlchemy async
- Alembic
- LangChain/LangGraph
- PostgreSQL

## Layering
Prefer this separation:

```text
HTTP/agent adapters
    ↓
application/domain services
    ↓
repositories/database access
```

Do not put substantial business logic directly in FastAPI route functions.

## Money
- Use `Decimal` end to end for financial amounts where practical.
- Persist using PostgreSQL `NUMERIC` or integer minor units.
- Never persist binary floating-point money.

## Database
- Use async sessions consistently.
- Keep transaction boundaries explicit.
- Prefer Alembic migrations.
- Scope user-owned data by authenticated user ID.
- Avoid N+1 query patterns when adding richer relationships.

## Agent Tools
- Tools should call application services rather than duplicating persistence logic.
- Tool schemas should be narrow and explicit.
- Return structured JSON-compatible results.
- Always include stable entity IDs for mutations and candidate matches.
- Do not accept trusted `user_id` from model-generated arguments.

## Agent Prompt
- Keep system prompt in one obvious location.
- Put hard safety/business invariants in code where possible, not only in prompt text.
- Inject current date/time context explicitly.
- Keep category vocabulary centralized.

## Errors
Use domain errors that adapters can convert into:
- HTTP errors for REST,
- structured tool errors for the agent.

Do not hide database failures behind successful-looking responses.

## Testing
Prioritize tests for:
- financial calculations,
- persistence behavior,
- date resolution,
- tool contracts,
- mutation safety,
- user isolation.

Typical commands:

```bash
uv run ruff check .
uv run pytest
```
