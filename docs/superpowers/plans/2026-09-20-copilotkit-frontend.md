# CopilotKit Frontend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a working CopilotKit chat to the Next.js frontend that reaches the existing FastAPI `expense_agent` through a same-origin runtime proxy.

**Architecture:** A Next.js catch-all route hosts CopilotKit Runtime and registers an AG-UI `HttpAgent` named `expense_agent`, pointed at the FastAPI endpoint from `BACKEND_AGENT_URL`. A small client provider connects the prebuilt `CopilotChat` to that runtime; financial logic and persistence remain entirely in the backend.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, CopilotKit React v2/runtime v2, AG-UI HTTP client, pnpm

**Spec:** `docs/superpowers/specs/2026-09-20-copilotkit-frontend-design.md`

## Global Constraints

- Implement Milestone 4 only; do not add a dashboard, authentication, conversation persistence, or custom generative UI.
- Register and address the agent with the exact key `expense_agent`.
- Default `BACKEND_AGENT_URL` to `http://localhost:8000/agents/expense` for local development.
- Keep the backend URL server-only; do not use a `NEXT_PUBLIC_` variable.
- Do not duplicate financial calculations, mutation state, or persistence logic in the frontend.
- Do not add a unit-test framework for declarative integration wiring; use runtime discovery plus lint, type-check, and production build as the smallest runnable checks.

---

## File Map

- `frontend/app/api/copilotkit/[[...slug]]/route.ts`: same-origin CopilotKit Runtime and `expense_agent` proxy registration.
- `frontend/app/copilot-provider.tsx`: client boundary containing `CopilotKitProvider`.
- `frontend/app/page.tsx`: focused, full-height prebuilt expense chat.
- `frontend/app/layout.tsx`: metadata, CopilotKit stylesheet, and provider wiring.
- `frontend/app/globals.css`: retain Tailwind import and set minimal page sizing/colors.
- `frontend/.env.example`: local FastAPI AG-UI endpoint example.
- `frontend/package.json`, `frontend/pnpm-lock.yaml`: installed CopilotKit and AG-UI packages.

### Task 1: Runtime Proxy

**Files:**
- Create: `frontend/app/api/copilotkit/[[...slug]]/route.ts`
- Create: `frontend/.env.example`
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml`

**Interfaces:**
- Consumes: FastAPI AG-UI endpoint `POST /agents/expense`; environment variable `BACKEND_AGENT_URL`.
- Produces: CopilotKit discovery endpoint `GET /api/copilotkit/info` and run endpoints under `/api/copilotkit/agent/expense_agent/*`.

- [ ] **Step 1: Install only the runtime dependencies**

Run:

```bash
cd frontend
pnpm add @ag-ui/client @copilotkit/react-core @copilotkit/runtime
```

Expected: `package.json` and `pnpm-lock.yaml` contain the three packages; no separate legacy `@copilotkit/react-ui` package is added because the v2 UI ships from `@copilotkit/react-core/v2`.

- [ ] **Step 2: Add the server-only environment example**

Create `frontend/.env.example`:

```dotenv
BACKEND_AGENT_URL=http://localhost:8000/agents/expense
```

- [ ] **Step 3: Add the runtime route**

Create `frontend/app/api/copilotkit/[[...slug]]/route.ts`:

```ts
import { HttpAgent } from "@ag-ui/client";
import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
  InMemoryAgentRunner,
} from "@copilotkit/runtime/v2";

const runtime = new CopilotRuntime({
  agents: {
    expense_agent: new HttpAgent({
      url:
        process.env.BACKEND_AGENT_URL ??
        "http://localhost:8000/agents/expense",
    }),
  },
  runner: new InMemoryAgentRunner(),
});

const handler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit",
});

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
```

- [ ] **Step 4: Run the first compile check**

Run:

```bash
cd frontend
pnpm exec tsc --noEmit
```

Expected: PASS. If the installed current runtime types have changed, adjust only the route to the official exported signatures; do not introduce an adapter abstraction.

- [ ] **Step 5: Verify agent discovery**

Start `pnpm dev`, then run:

```bash
curl -fsS http://localhost:3000/api/copilotkit/info
```

Expected: HTTP 200 and a response advertising the exact agent key `expense_agent`. This discovery check does not require PostgreSQL or `OPENAI_API_KEY` because it does not run the agent.

- [ ] **Step 6: Commit the runtime proxy**

```bash
git add frontend/.env.example frontend/package.json frontend/pnpm-lock.yaml 'frontend/app/api/copilotkit/[[...slug]]/route.ts'
git commit -m "feat: proxy expense agent through CopilotKit runtime"
```

### Task 2: Chat Surface

**Files:**
- Create: `frontend/app/copilot-provider.tsx`
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/app/globals.css`

**Interfaces:**
- Consumes: runtime URL `/api/copilotkit` and registered agent ID `expense_agent` from Task 1.
- Produces: a full-height browser chat that streams messages and errors from the backend agent.

- [ ] **Step 1: Add the client provider boundary**

Create `frontend/app/copilot-provider.tsx`:

```tsx
"use client";

import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import type { ReactNode } from "react";

export function CopilotProvider({ children }: { children: ReactNode }) {
  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      agentId="expense_agent"
    >
      {children}
    </CopilotKitProvider>
  );
}
```

- [ ] **Step 2: Wire the provider and v2 stylesheet at the app boundary**

Update `frontend/app/layout.tsx` to retain the existing Geist font setup, import the CopilotKit stylesheet once, set the product metadata, and wrap `children`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@copilotkit/react-core/v2/styles.css";
import "./globals.css";
import { CopilotProvider } from "./copilot-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Expense Assistant",
  description: "Record expenses in natural language.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <CopilotProvider>{children}</CopilotProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Replace the generated page with the prebuilt chat**

Replace `frontend/app/page.tsx`:

```tsx
"use client";

import { CopilotChat } from "@copilotkit/react-core/v2";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col p-4 sm:p-8">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Expense Assistant</h1>
        <p className="text-sm text-zinc-600">
          Record an expense or ask about your spending.
        </p>
      </header>
      <section className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <CopilotChat
          agentId="expense_agent"
          labels={{
            chatInputPlaceholder: "Try: spent 30 euros at Aldi today",
          }}
        />
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Reduce global CSS to page-level defaults**

Replace generated demo-specific rules in `frontend/app/globals.css` while retaining the Tailwind import:

```css
@import "tailwindcss";

:root {
  color-scheme: light;
}

html,
body {
  min-height: 100%;
}

body {
  margin: 0;
  background: #f4f4f5;
  color: #18181b;
  font-family: Arial, Helvetica, sans-serif;
}
```

- [ ] **Step 5: Run frontend verification**

Run:

```bash
cd frontend
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

Expected: all three commands exit 0.

- [ ] **Step 6: Run the existing backend endpoint check**

Run:

```bash
cd backend
uv run pytest tests/test_agent.py::test_expense_agent_agui_endpoint_is_registered
```

Expected: PASS with the health endpoint still returning the configured `expense_agent` name.

- [ ] **Step 7: Smoke-test the complete flow when services and secrets are available**

Run the backend on port 8000 and frontend on port 3000, open the chat, and submit:

```text
went to Aldi and spent 30 euros
```

Expected: the response streams in the chat, confirms only after the backend tool succeeds, and exactly one `30.00 EUR` Aldi expense is persisted. Stop here and report the smoke test as blocked rather than claiming it passed if PostgreSQL or `OPENAI_API_KEY` is unavailable.

- [ ] **Step 8: Commit the chat surface**

```bash
git add frontend/app/copilot-provider.tsx frontend/app/layout.tsx frontend/app/page.tsx frontend/app/globals.css
git commit -m "feat: add CopilotKit expense chat"
```
