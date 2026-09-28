# Agent Expense Cache Invalidation Design

## Goal

Keep the Next.js expense dashboard synchronized after the backend agent completes an expense tool call, without requiring a browser reload.

## Existing Flow

- Backend expense tools return structured JSON through LangGraph and AG-UI.
- `CopilotKitProvider` owns the chat connection.
- The same provider owns the React Query `QueryClient`.
- Dashboard queries use keys beginning with `expenses`, including monthly transactions and category totals.

## Design

Add a small listener inside `CopilotProvider`, below `CopilotKitProvider`, so it can access both CopilotKit's event stream and the existing React Query client.

Subscribe to CopilotKit's `onToolExecutionEnd` event. For these backend tools:

- `add_expense`
- `update_expense`
- `delete_expense`
- `find_expenses`

parse the returned JSON and invalidate React Query's `['expenses']` prefix only when the tool result reports a successful status:

- `created`
- `updated`
- `deleted`
- `success`

Prefix invalidation refreshes all active expense-derived views, including recent transactions and category summaries. Failed tool calls, malformed results, CopilotKit execution errors, and unrelated tools do nothing.

The backend tools remain authoritative and unchanged. Cache correctness does not depend on the language model remembering to invoke a frontend refresh tool.

## Error Handling

Tool result parsing is defensive. Invalid JSON or an unexpected result shape is ignored because cache invalidation is a UI synchronization aid and must not break the chat run.

## Testing

Add a pure predicate/parser test covering:

- successful relevant mutation and read results trigger invalidation;
- structured backend error results do not trigger invalidation;
- unrelated tools do not trigger invalidation;
- malformed JSON does not trigger invalidation.

Run frontend tests and type-check. Existing unrelated type-check failures will be reported separately if still present.

## Non-goals

- Optimistic cache updates.
- Polling.
- Backend event infrastructure.
- Cross-browser or cross-user real-time synchronization.
