# Expense Tracker AI monorepo

## Applications

- `apps/web` — Next.js dashboard
- `apps/expense-api` — FastAPI expense and agent API
- `apps/workforce-api` — NestJS workforce API
- `packages/contracts` — committed OpenAPI types and typed client factories

## Local setup

Install JavaScript and Python dependencies, then create local environment files:

```bash
pnpm install
cd apps/expense-api && uv sync && cp .env.example .env && cd ../..
cp apps/workforce-api/.env.example apps/workforce-api/.env
cp apps/web/.env.example apps/web/.env
```

Start PostgreSQL, create both databases, apply Alembic and Prisma migrations,
and run all three applications:

```bash
pnpm dev
```

## Contracts

FastAPI and NestJS OpenAPI documents are authoritative. Regenerate committed
TypeScript contracts after changing an API schema:

```bash
pnpm contracts:generate
```

CI runs `pnpm contracts:check` and fails when generated files drift.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
