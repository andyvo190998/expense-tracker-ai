# Implementation Plan

## Strategy
Build deterministic product functionality first, then layer agent behavior on top. Each milestone should leave the project in a runnable state.

## Milestone 1 — Backend Foundation
Goal: store and retrieve expenses without AI.

Tasks:
- create FastAPI project,
- configure PostgreSQL,
- configure SQLAlchemy async sessions,
- create Expense model,
- add Alembic,
- implement schemas,
- implement CRUD service,
- implement REST routes,
- add backend tests.

Done when:
- an expense can be created/read/updated/deleted through REST,
- money is stored safely,
- migrations run cleanly,
- tests pass.

## Milestone 2 — Deterministic Analytics
Goal: power the dashboard without the LLM.

Tasks:
- monthly total query,
- category aggregation query,
- recent expenses query,
- trend query,
- REST analytics endpoints.

Done when:
- dashboard-ready JSON is returned from SQL-backed endpoints,
- totals are tested with known fixture data.

## Milestone 3 — First Agent Tool
Goal: make one natural-language create flow work end to end.

Tasks:
- configure LangChain/LangGraph,
- define system prompt,
- implement `add_expense`,
- return structured tool output,
- add agent tests/evaluation examples.

Golden path:

```text
"went to Aldi and spent 30 euros"
→ tool call
→ DB row
→ confirmation
```

Done when:
- exactly one row is created,
- values are correct,
- assistant never confirms before tool success.

## Milestone 4 — CopilotKit Integration
Goal: expose the agent in the Next.js app.

Tasks:
- create Next.js app,
- configure CopilotKit,
- expose backend LangGraph agent via AG-UI,
- wire chat UI,
- verify streaming/tool interactions.

Done when:
- a chat message from browser creates an expense in PostgreSQL.

## Milestone 5 — Dashboard
Goal: provide useful non-chat product value.

Tasks:
- dashboard shell,
- current-month total,
- category chart,
- recent expenses,
- monthly trend,
- loading/error states.

Done when:
- dashboard uses REST/data APIs rather than asking the LLM to calculate values.

## Milestone 6 — Read and Analytics Tools
Goal: let the assistant answer questions from live data.

Tools:
- `find_expenses`,
- `get_total_expenses`,
- `get_spending_by_category`,
- `get_spending_trend`.

Done when queries such as these work:

```text
how much did I spend this month?
how much on groceries?
what was my biggest expense?
```

## Milestone 7 — Conversation Corrections
Goal: support natural follow-up editing.

Tasks:
- add stable IDs to all tool outputs,
- implement `update_expense`,
- resolve recent referenced expense,
- handle ambiguous matches.

Done when:

```text
Aldi 30 euros
actually it was 35
```

updates the original row instead of creating a duplicate.

## Milestone 8 — Safe Delete / HITL
Goal: require user confirmation for destructive actions.

Tasks:
- implement delete candidate lookup,
- render confirmation UI,
- execute `delete_expense` only after approval,
- add cancellation path.

## Milestone 9 — Authentication
Goal: support multiple users safely.

Tasks:
- add auth provider,
- pass authenticated identity to backend,
- scope every query/mutation by user,
- remove demo/static user IDs,
- add isolation tests.

Do not deploy publicly with shared unscoped data.

## Milestone 10 — Persistence
Goal: preserve agent conversation state across restart.

Tasks:
- configure LangGraph persistence/checkpointer,
- prefer PostgreSQL-backed persistence,
- map conversations/threads to authenticated users.

## Milestone 11 — Generative UI
Goal: make AI responses visually useful.

Examples:
- expense confirmation card,
- category summary card,
- inline spending chart,
- delete confirmation component.

## Milestone 12 — Semantic Search (Optional)
Only implement when structured data is insufficient.

Example requirement:

```text
show everything I spent on my car
```

Tasks:
- enable pgvector,
- decide what text representation gets embedded,
- add embedding column/index,
- combine semantic retrieval with structured filters.

Do not introduce Pinecone unless pgvector is insufficient for measured requirements.

## Milestone 13 — Deployment
Initial stack:

```text
reverse proxy
Next.js
FastAPI
PostgreSQL
```

Tasks:
- Dockerfiles,
- compose file,
- env management,
- health checks,
- HTTPS,
- backups,
- database volume,
- observability/logging.

## Codex Task Style
Prefer giving Codex milestone-sized tasks with explicit acceptance criteria.

Good prompt:

```text
Implement Milestone 3's add_expense tool.
Read AGENTS.md, ARCHITECTURE.md, docs/AGENT_CONTRACTS.md, and the existing backend patterns first.
Do not change frontend code.
Add tests covering a successful create and a failed DB write.
Run backend checks before finishing.
```

Avoid prompts such as:

```text
build the AI backend
```

because they leave too many architectural choices implicit.
