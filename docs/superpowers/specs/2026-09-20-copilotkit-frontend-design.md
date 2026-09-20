# CopilotKit Frontend Integration Design

## Scope

Implement Milestone 4 only: a working CopilotKit chat in the existing Next.js App Router frontend, connected to the backend AG-UI agent named `expense_agent`. Dashboard UI, custom generative UI, authentication, and conversation persistence remain out of scope.

## Architecture

Use CopilotKit's supported three-layer flow:

```text
Browser chat
  -> Next.js CopilotKit runtime at /api/copilotkit
  -> HttpAgent proxy
  -> FastAPI AG-UI endpoint at /agents/expense
```

The browser talks only to the same-origin Next.js runtime. The runtime reads the backend agent URL from `BACKEND_AGENT_URL`, defaulting to `http://localhost:8000/agents/expense` for local development, and registers it under `expense_agent`.

Direct browser-to-FastAPI access is rejected because CopilotKit documents it as a development-only path and it would couple the UI to CORS and future authentication concerns. A custom headless chat is rejected because the prebuilt chat surface satisfies this milestone with less code.

## Frontend Changes

- Add only the CopilotKit React UI, React core, runtime, and AG-UI client packages required by the current official API.
- Add an App Router catch-all runtime route at `app/api/copilotkit/[[...slug]]/route.ts`.
- Add a small client provider component that configures `/api/copilotkit` and `expense_agent`.
- Wrap the application in that provider from the server `app/layout.tsx`.
- Replace the generated landing page with the prebuilt CopilotKit chat surface and concise expense-assistant copy.
- Import the package's required stylesheet and update page metadata.
- Document `BACKEND_AGENT_URL` in `frontend/.env.example`.

CopilotKit-specific code stays in the runtime route and provider/chat components. No financial logic or backend state is duplicated in the frontend.

## Data and Error Flow

Messages stream from the chat through the Next.js runtime to the existing FastAPI AG-UI endpoint. The backend remains authoritative for tool calls and persistence. The UI renders streamed assistant output and CopilotKit's built-in running/error states; it does not infer successful writes independently from prose.

Missing or unreachable backend configuration must produce a visible chat/runtime error rather than a false success. No secrets are exposed through public environment variables.

## Verification

- Add one focused test for the local backend-agent URL fallback/configuration if configuration logic is non-trivial; otherwise rely on type/build verification for declarative wiring.
- Run `pnpm lint`.
- Run `pnpm exec tsc --noEmit` because no separate typecheck script exists yet.
- Run `pnpm build`.
- Run the existing backend AG-UI endpoint registration/health test.
- Manually smoke-test the golden path when PostgreSQL and `OPENAI_API_KEY` are available: submit `went to Aldi and spent 30 euros`, observe streaming confirmation, and verify one persisted row.

## Acceptance Criteria

1. The Next.js page displays a usable CopilotKit chat.
2. CopilotKit discovers `expense_agent` through `/api/copilotkit`.
3. A browser message reaches `POST /agents/expense` through the runtime proxy.
4. Backend tool and model failures appear as failures, not successful saves.
5. No dashboard, authentication, persistence, or custom chat abstraction is added.
