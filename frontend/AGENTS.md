# Frontend Instructions

Scope: all files under `frontend/`.

## Stack
- Next.js
- TypeScript
- CopilotKit

## Priorities
1. Keep dashboard/data views deterministic.
2. Use the agent for conversational interaction, not routine chart computation.
3. Keep API/agent integration isolated in reusable client modules/hooks.
4. Prefer server components for ordinary data loading when appropriate; use client components only where interactivity requires them.
5. Keep CopilotKit-specific logic out of unrelated presentation components.

## UI Expectations
- Handle loading, empty, and error states.
- Display currency consistently.
- Avoid silently rounding monetary values in ways that change meaning.
- Destructive actions require visible confirmation.
- Prefer accessible semantic HTML and keyboard-operable interactions.

## TypeScript
- Avoid `any` unless unavoidable and documented.
- Type API payloads and responses.
- Reuse generated/shared schema types if the repository introduces them.
- Narrow unknown external data before use.

## Agent UI
- Treat tool output as structured data.
- Use stable expense IDs for follow-up UI actions.
- Do not infer successful mutations from assistant prose alone.
- Render the backend/tool result as the authoritative state.

## Verification
Use repository scripts where available. Typical checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
