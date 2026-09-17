# Architecture

## Goal
Build a full-stack AI expense assistant that turns natural-language messages into reliable financial records and deterministic analytics.

Example:

```text
User: "went to Aldi and spent 30 euros"
```

Expected normalized record:

```json
{
  "merchant": "Aldi",
  "amount": "30.00",
  "currency": "EUR",
  "category": "groceries",
  "spent_at": "2026-09-17"
}
```

## High-Level System

```text
┌─────────────────────────────┐
│ Next.js                     │
│ - dashboard                 │
│ - expense management        │
│ - CopilotKit chat UI        │
└──────────────┬──────────────┘
               │
        REST   │   AG-UI
               │
┌──────────────▼──────────────┐
│ FastAPI                     │
│                             │
│ REST application services   │
│ LangGraph/LangChain agent   │
│ domain services             │
└──────────────┬──────────────┘
               │
               │ SQLAlchemy
               │
┌──────────────▼──────────────┐
│ PostgreSQL                  │
│ - users                     │
│ - expenses                  │
│ - categories                │
│ - budgets later             │
│ - pgvector later if needed  │
└─────────────────────────────┘

External LLM provider is called only by the backend agent layer.
```

## Technology Choices

### Frontend
- Next.js
- TypeScript
- CopilotKit
- chart library such as Recharts

### Backend
- Python
- FastAPI
- LangGraph/LangChain
- SQLAlchemy async
- Alembic

### Data
- PostgreSQL as primary database
- pgvector only after a demonstrated semantic-search need
- no Pinecone in the MVP

## Architectural Boundaries

### LLM responsibilities
The LLM may:
- interpret user intent,
- extract structured fields,
- choose tools,
- infer a reasonable category,
- explain results,
- decide whether clarification is needed.

The LLM must not:
- persist records directly,
- invent transaction IDs,
- calculate authoritative financial totals when SQL can do so,
- claim a mutation succeeded before a tool succeeds,
- bypass user scoping.

### Backend responsibilities
Backend code must:
- validate structured inputs,
- perform database writes,
- run deterministic calculations,
- enforce auth/user scoping,
- expose REST endpoints,
- expose the agent over AG-UI,
- return structured tool results.

### Frontend responsibilities
Frontend code must:
- render dashboard data,
- collect user input,
- display agent/tool progress where appropriate,
- provide confirmations for destructive actions,
- avoid embedding business-critical financial logic that belongs on the server.

## Core Data Model

### Expense
Suggested fields:

```text
id             UUID
user_id        UUID/string
merchant       nullable text
description    nullable text
amount         NUMERIC(12,2)
currency       char(3)
category       text or category_id
spent_at       date
created_at     timestamptz
updated_at     timestamptz
```

Persist money using `NUMERIC`/`Decimal` or integer cents. Do not use floating point for stored money.

## Request Flows

### Create expense from chat

```text
User message
  ↓
CopilotKit
  ↓
AG-UI
  ↓
Agent extracts intent
  ↓
add_expense tool
  ↓
validation/domain service
  ↓
PostgreSQL INSERT
  ↓
structured tool result
  ↓
assistant confirms success
```

### Dashboard analytics

```text
Dashboard
  ↓
GET /analytics/summary
  ↓
SQL aggregate query
  ↓
JSON response
  ↓
chart/cards
```

No LLM is required for normal dashboard loading.

### Conversation correction

```text
User: "Aldi 30 euros"
  ↓
add_expense -> returns expense ID
  ↓
User: "sorry, it was 35"
  ↓
agent resolves the recent expense ID
  ↓
update_expense(id, amount=35)
```

## API Direction

Suggested REST surface:

```text
POST   /expenses
GET    /expenses
GET    /expenses/{id}
PATCH  /expenses/{id}
DELETE /expenses/{id}

GET    /analytics/summary
GET    /analytics/monthly
GET    /analytics/categories

GET    /categories
```

Agent endpoint is separate from these deterministic APIs.

## Semantic Search
Do not introduce embeddings in the MVP.

Add pgvector only when queries such as the following cannot be handled well with structured fields:

```text
"show everything related to my car"
```

That query may need to match fuel, parking, insurance, and maintenance across different categories/descriptions.

Preferred evolution:

```text
PostgreSQL
  → PostgreSQL + pgvector
  → only consider external vector DB if scale or operational needs justify it
```

## Deployment
Initial deployment can run on one VPS:

```text
reverse proxy
frontend container
backend container
postgres container
```

Recommended early size when LLM inference is external:
- 4 vCPU
- 8 GB RAM
- 80–160 GB SSD

Scale components independently only after usage demonstrates a need.
