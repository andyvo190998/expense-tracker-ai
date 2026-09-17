# Product Spec

## Product
AI-powered personal expense assistant with a conversational input surface and a traditional analytics dashboard.

## Primary User Job
A user should be able to record spending with natural language without filling out a form every time.

Example:

```text
"went to Aldi and spent 30 euros"
```

The system should understand that this likely means:
- merchant: Aldi
- amount: 30.00
- currency: EUR
- category: groceries
- date: today unless specified otherwise

## MVP Capabilities

### 1. Add expense by chat
Supported examples:

```text
Aldi 30 euros
spent 42.60 at Lidl yesterday
paid 65 euros for fuel at Shell
Netflix 17.99
```

### 2. Review recent expenses
Examples:

```text
show my recent expenses
what did I spend yesterday?
```

### 3. Edit by conversation
Example:

```text
User: Aldi 30 euros
Assistant: Saved.
User: actually it was 35
```

The system should update the intended recent transaction rather than create a second expense.

### 4. Delete with confirmation
Example:

```text
remove my last Aldi expense
```

The system should identify the candidate and ask for confirmation before deleting it.

### 5. Dashboard
Dashboard should include at least:
- current-month total,
- total by category,
- recent expenses,
- spending trend over time.

### 6. Natural-language analytics
Examples:

```text
how much did I spend this month?
how much on groceries this month?
what was my biggest expense this month?
compare this month with last month
```

Calculations must come from deterministic backend/database queries.

## Default Behavior

### Currency
Default currency: `EUR` unless user/account configuration says otherwise.

### Missing date
If the user does not specify a date, use the current local date supplied by the backend.

### Category inference
Initial categories:

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

Infer a category when the mapping is obvious. Ask for clarification only when the ambiguity materially affects the record.

### Merchant normalization
Preserve a readable merchant name. Merchant aliases/rules may later be stored in the database for deterministic classification.

## UX Rules
- Do not make the user confirm every small ordinary expense.
- Do confirm destructive actions.
- Consider confirmation for unusually large or suspicious values.
- After a successful create/update/delete, clearly state what changed.
- If an operation fails, do not phrase the response as successful.
- Show exact amount, currency, merchant, and date when confirmation is useful.

## Non-Goals for MVP
- Bank account syncing
- Receipt OCR
- Multi-currency conversion
- Tax filing
- Financial advice
- Pinecone
- autonomous budgeting decisions

## Future Features
- budgets,
- recurring expenses,
- income tracking,
- cash-flow view,
- receipt upload,
- bank import,
- semantic search via pgvector,
- proactive insights,
- anomaly detection,
- recurring merchant/category rules.

## Acceptance Examples

### Create
Input:

```text
went to Aldi and spent 30 euros
```

Expected result:
- one expense persisted,
- amount exactly 30.00 EUR,
- merchant Aldi,
- category groceries unless overridden,
- assistant confirms only after successful persistence.

### Relative date
Input:

```text
spent 25 euros at Lidl yesterday
```

Expected result:
- backend resolves yesterday against the current application date,
- persisted `spent_at` is the resolved date.

### Correction
Input:

```text
actually make that 35
```

Expected result:
- recent intended expense is updated,
- no duplicate transaction is created.

### Delete
Input:

```text
delete my last Aldi expense
```

Expected result:
- candidate is identified,
- deletion is not executed before confirmation.
