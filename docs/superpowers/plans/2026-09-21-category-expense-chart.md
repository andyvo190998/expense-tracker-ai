# Category Expense Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose monthly category expense totals and render them in a TanStack Query-backed bar chart.

**Architecture:** FastAPI exposes the existing grouped SQL service through an explicit response contract. A same-origin Next.js proxy forwards period queries, while `RevenueBreakdown` derives month bounds and uses TanStack Query to fetch and render the aggregate response.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy async, pytest, Next.js, TypeScript, TanStack Query, shadcn/ui, Recharts, i18next.

**Spec:** `docs/superpowers/specs/2026-09-21-category-expense-chart-design.md`

## Global Constraints

- Do not load individual expenses or aggregate money in the browser.
- Use inclusive `start_date` and `end_date` query parameters.
- Return only categories with expenses, scoped to the current demo user and EUR.
- Default the frontend filter to the browser's current local month.
- Do not add dependencies or commit changes.

---

### Task 1: Category aggregation API

**Files:**
- Modify: `backend/tests/test_expenses.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routes.py`

**Interfaces:**
- Consumes: `services.get_spending_by_category(session, user_id, start_date, end_date)`
- Produces: `GET /expenses/by-category?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`

- [x] Write an API test that inserts two September grocery expenses, one September transport expense, an August expense, and foreign-user data; assert one summed row per September category.
- [x] Run the focused test and verify the missing route fails.
- [x] Add Pydantic item/response schemas and the static route before `/{expense_id}`.
- [x] Validate `end_date >= start_date` with HTTP 422 and serialize decimals with two places.
- [x] Run the focused API tests and backend checks.

### Task 2: Month range and proxy

**Files:**
- Create: `frontend/src/lib/expense-period.ts`
- Create: `frontend/src/lib/expense-period.test.ts`
- Create: `frontend/src/app/api/expenses/by-category/route.ts`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `monthRange(month: string): { startDate: string; endDate: string }`
- Produces: same-origin `GET /api/expenses/by-category`

- [x] Write a Node test asserting September, December, and leap-year February date bounds.
- [x] Run the focused test and verify the missing helper fails.
- [x] Implement the month-boundary helper with native `Date`.
- [x] Add a proxy route that validates both date parameters and forwards them to the FastAPI origin derived from `BACKEND_AGENT_URL`.
- [x] Run the frontend test.

### Task 3: TanStack Query bar chart

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard-2/components/revenue-breakdown.tsx`
- Modify: `frontend/src/i18n/resources.ts`

**Interfaces:**
- Consumes: `{ currency, start_date, end_date, items: { category, amount }[] }`
- Consumes: `monthRange(month)` and `/api/expenses/by-category`

- [x] Replace placeholder pie data with `useQuery`, keyed by selected `YYYY-MM`.
- [x] Generate the current and previous 11 months with the current month selected initially.
- [x] Render shadcn/Recharts `BarChart`, formatted EUR values, and translated title/filter/loading/empty/error/retry text.
- [x] Preserve the user's existing chart sizing change and remove obsolete selector/export/pie state.
- [x] Run frontend test, typecheck/build, backend pytest, Ruff, and `git diff --check`; report unrelated baseline failures.
