# Expense Tracker AI monorepo

## Applications

- `apps/web` — Next.js dashboard
- `apps/expense-api` — FastAPI expense and agent API
- `apps/workforce-api` — NestJS workforce API
- `apps/notification-server` — NestJS expense notification worker
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
and run all four applications (the notification server loads its own `.env`):

```bash
pnpm dev
```


The expense API development command starts both Uvicorn and the outbox relay.
Both load `apps/expense-api/.env`. Start Kafka before running `pnpm dev`
and configure the expense API environment for your local broker:

```dotenv
APP_ENV=development
KAFKA_ALLOW_LOCAL_PLAINTEXT=true
KAFKA_BOOTSTRAP_SERVERS=127.0.0.1:19092
```

To run only this pair from the repository root:

```bash
pnpm --filter @expense-tracker/expense-api dev
```

Logs are prefixed with `api` and `relay`. Ctrl+C stops both processes.
If either process exits, the development runner stops its companion.

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
