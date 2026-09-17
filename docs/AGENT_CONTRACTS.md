# Agent and Tool Contracts

## Purpose
This document defines the behavioral contract between the LLM agent, backend tools, and persistence layer.

The agent is an interpreter/orchestrator. Tools and backend services remain authoritative.

## Agent Invariants
The agent must always follow these rules:

1. Use tools for financial reads and writes.
2. Never fabricate transaction state.
3. Never claim a write succeeded before the tool succeeds.
4. Prefer exact database results over model estimates.
5. Preserve stable IDs from tool outputs for later edits and deletes.
6. Resolve relative dates using an explicit current date supplied by the backend.
7. Require confirmation before destructive operations.
8. Avoid unnecessary clarifying questions when a reasonable, low-risk inference is possible.
9. If required information is missing and cannot safely be inferred, ask one focused question.
10. Keep user data isolated by authenticated user context.

## Core Tools

### `add_expense`
Purpose: create one expense.

Input contract:

```json
{
  "merchant": "Aldi",
  "amount": "30.00",
  "currency": "EUR",
  "category": "groceries",
  "spent_at": "2026-09-17",
  "description": null
}
```

Rules:
- `amount` must be positive.
- persisted monetary conversion must use `Decimal`/numeric-safe parsing.
- `currency` defaults to EUR if not otherwise known.
- return the created expense ID.

Recommended result:

```json
{
  "status": "created",
  "expense": {
    "id": "uuid",
    "merchant": "Aldi",
    "amount": "30.00",
    "currency": "EUR",
    "category": "groceries",
    "spent_at": "2026-09-17"
  }
}
```

### `find_expenses`
Purpose: retrieve candidate expenses for conversational queries or follow-up mutation.

Possible filters:
- date range,
- merchant,
- category,
- minimum/maximum amount,
- limit/order.

Tool should return stable IDs.

### `update_expense`
Purpose: patch an existing expense.

Input should contain:
- exact expense ID,
- only fields being changed.

Do not infer an arbitrary record when multiple plausible candidates exist. Resolve candidate first.

### `delete_expense`
Purpose: delete an exact expense by stable ID.

Contract:
- confirmation must happen before this tool is called,
- tool should return enough information to confirm what was deleted.

### `get_total_expenses`
Purpose: return exact total for a date range and optional filters.

Implement aggregate calculations in SQL/backend code.

Recommended result:

```json
{
  "total": "823.40",
  "currency": "EUR",
  "from": "2026-09-01",
  "to": "2026-09-30"
}
```

### `get_spending_by_category`
Purpose: exact category aggregation for a requested period.

Recommended result:

```json
{
  "currency": "EUR",
  "items": [
    {"category": "groceries", "amount": "280.40"},
    {"category": "transport", "amount": "150.00"}
  ]
}
```

## Mutation Policy

### Ordinary create
May be executed without an additional confirmation when the request is clear and amount is ordinary.

### Ambiguous create
Ask for clarification if a missing/ambiguous field could materially change the record.

Example:

```text
"Aldi 30"
```

If account default currency is EUR, do not ask for currency.

### Suspicious amount
Large-value thresholds should be configurable rather than hard-coded in prompt text.

A possible product policy is to ask for confirmation when the amount is unusually high relative to user history or exceeds a configured limit.

### Update
Normal corrections can be applied directly if the target expense is unambiguous.

### Delete
Always require explicit confirmation.

## Date Handling
The backend should inject the current date/time context.

Examples:

```text
today
yesterday
last Monday
last week
```

The agent may interpret these phrases, but persisted dates must be explicit ISO dates.

## Category Handling
Initial allowed categories:

```text
groceries
restaurants
transport
rent
utilities
shopping
entertainment
health
travel
subscriptions
other
```

If category inference is uncertain but low impact, use `other` only if that product behavior is explicitly desired. Otherwise ask a short clarification.

## Tool Error Handling
Tools should return structured, actionable errors.

Example:

```json
{
  "status": "error",
  "code": "EXPENSE_NOT_FOUND",
  "message": "No matching expense exists for this user."
}
```

Agent behavior:
- do not convert errors into false success,
- explain the issue concisely,
- request only the missing information needed to continue.

## Security Boundary
Never allow the model to provide or override `user_id` as a trusted tool argument.

User identity must come from authenticated server context.

Bad:

```python
add_expense(user_id=model_supplied_user_id, ...)
```

Preferred:

```python
user_id = authenticated_context.user_id
```

## Testing Scenarios
At minimum, cover:
- normal create,
- decimal amount,
- default EUR,
- explicit date,
- relative date,
- correction of latest transaction,
- ambiguous correction,
- delete confirmation,
- failed database write,
- user isolation,
- aggregate totals,
- category aggregation.
