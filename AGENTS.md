# AGENTS.md

## Purpose
This repository is a full-stack AI expense assistant. Users can write natural-language messages such as `went to Aldi and spent 30 euros`, and the system should safely convert them into structured financial records, persist them in PostgreSQL, and expose deterministic analytics through a dashboard.

Treat this file as a map. Read the linked docs before changing architecture or agent behavior.

## Read First
- `ARCHITECTURE.md` — system boundaries, data flow, and major technology decisions.
- `docs/PRODUCT_SPEC.md` — product behavior and user-facing rules.
- `docs/AGENT_CONTRACTS.md` — agent/tool contracts, safety rules, and structured outputs.
- `docs/IMPLEMENTATION_PLAN.md` — implementation sequence and current milestones.

## Repository Shape
Expected high-level structure:

```text
frontend/    Next.js + TypeScript + CopilotKit
backend/     FastAPI + Python + LangGraph/LangChain
docs/        product and engineering source of truth
docker-compose.yml
```

## Core Principles
1. PostgreSQL is the source of truth for financial data.
2. The LLM interprets intent; deterministic code performs calculations and persistence.
3. Never ask the LLM to calculate totals that SQL can calculate exactly.
4. Never claim a mutation succeeded unless the corresponding tool/database operation succeeded.
5. Prefer structured tool outputs over prose-only outputs.
6. Financial mutations must be auditable and user-scoped.
7. Do not add Pinecone unless a concrete semantic-search requirement justifies it.
8. Prefer PostgreSQL + pgvector before introducing a separate vector database.
9. Keep dashboard reads independent from the agent whenever possible.
10. Avoid overengineering the MVP.

## Development Workflow
Before editing:
1. Inspect nearby code and existing patterns.
2. Read the relevant docs listed above.
3. Identify whether the change is frontend, backend, agent behavior, database, or cross-cutting.
4. Preserve existing public contracts unless the task explicitly requires changing them.

While editing:
- Make the smallest coherent change that fully solves the task.
- Prefer explicit types and narrow interfaces.
- Keep business logic out of HTTP route handlers where practical.
- Keep database access out of UI code.
- Keep prompt text centralized rather than duplicated across files.
- Add comments only where intent is not obvious from the code.

After editing:
- Run relevant format, lint, type-check, and test commands.
- Report what changed and which checks were run.
- If a check cannot run because of missing services/secrets, say so clearly.

## Expected Commands
Use the commands present in the repository if they differ from these defaults.

Frontend:
```bash
cd frontend
npm run lint
npm run typecheck
npm test
```

Backend:
```bash
cd backend
uv run ruff check .
uv run pytest
```

Full stack:
```bash
docker compose config
docker compose up -d
```

Do not invent passing test results.

## Environment and Secrets
- Never commit secrets.
- Keep secret values in local environment files or deployment secret stores.
- It is acceptable to document required variable names, but never real values.
- Typical variables include:
  - `DATABASE_URL`
  - `OPENAI_API_KEY`
  - frontend/backend public URLs
  - auth provider secrets once authentication is added

## Database Rules
- Use UUIDs for externally referenced entities unless existing code uses another stable strategy.
- Use `NUMERIC`/`Decimal` or integer minor units for money; never binary floating point for persisted money.
- Store timestamps/dates with clear semantics.
- Every user-owned query must be scoped by authenticated `user_id` once auth exists.
- Prefer migrations over ad-hoc schema mutation outside early local prototyping.

## Agent Rules
- Tools are the only path for reading or mutating financial records.
- The assistant must not fabricate database state.
- Resolve dates explicitly.
- Infer categories only when confidence is reasonable; otherwise ask a focused clarification.
- Require confirmation for destructive or unusually risky actions according to `docs/AGENT_CONTRACTS.md`.
- Tool return values should include stable IDs for follow-up edits/undo flows.

## API Rules
- REST endpoints serve deterministic dashboard/product functionality.
- The agent endpoint serves conversational/agent behavior.
- Do not route ordinary dashboard charts through the LLM.
- Keep API schemas versionable and explicit.

## Scope-Specific Instructions
Additional instructions may exist in:
- `frontend/AGENTS.md`
- `backend/AGENTS.md`

More specific instructions take precedence for files in their subtree.

## Definition of Done
A task is complete when:
- behavior matches the request,
- code follows local architecture and contracts,
- relevant tests/checks pass or blocked checks are disclosed,
- no secrets or unrelated refactors are introduced,
- docs are updated when behavior/contracts/architecture change.
