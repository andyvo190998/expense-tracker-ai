# Vercel deployment

Import the repository as one Vercel project with the project root at the
repository root. The root `vercel.json` defines three HTTP services and two
continuous workers. Enable access to Vercel Services and Daemons for the project.
See [Services](https://vercel.com/docs/services) and
[Daemons](https://vercel.com/docs/daemons) for platform availability and pricing.

## Routing and bindings

| Name | Runtime | Public routing | Calls |
| --- | --- | --- | --- |
| `web` | Next.js | `/(.*)` | `expense-api`, `workforce-api` |
| `expense-api` | FastAPI (`main:app`) | Internal | PostgreSQL, OpenAI |
| `workforce-api` | NestJS | Internal | PostgreSQL |
| `notification-server` | Node.js daemon | None | Kafka, Brevo SMTP, optional Observe |
| `expense-outbox-relay` | Python daemon | None | PostgreSQL, Kafka |

Browsers keep using the web application's existing `/api/auth/*`,
`/api/admin/*`, `/api/expenses*`, `/api/workforce/*`, and `/api/copilotkit/*`
routes. Next.js functions forward cookies and CSRF headers to the internal APIs.
The workforce proxy maps `/api/workforce/*` to the existing `/v1/*` routes;
the expense proxy uses the backend's existing routes, and CopilotKit calls
`/agents/expense`. Neither backend needs a public prefix or a public rewrite.

Vercel injects `EXPENSE_API_URL` and `WORKFORCE_API_URL` into the calling `web`
service. Do not configure either variable manually on Vercel or expose them as
`NEXT_PUBLIC_*` variables. Both are read inside request handlers, never in
middleware or during the build. Existing `BACKEND_AGENT_URL` remains supported
for deployments outside Vercel; the expense binding takes precedence over it.

The notification app is a Kafka consumer, despite having Vite as a test
dependency. It must run continuously, as must `python -m app.outbox_relay`.
They are daemons rather than request-driven services and need no HTTP binding
to each other: Kafka carries the events. The configuration proposes one
instance of each in Frankfurt (`fra1`); confirm the region against the database
and broker location. Daemons use the repository root as their Docker build
context. `.dockerignore` excludes local secrets and generated files.

## External resources and environment

Provision managed PostgreSQL and a reachable Kafka broker separately. This
configuration uses a shared `DATABASE_URL` for the two APIs and the relay;
both migration tools can create their service-owned tables in that database.
Use a separate database for each preview environment to isolate financial data.
If separate databases per API are required, arrange scoped environment values
or add distinct database variable names before deploying; the current apps both
read `DATABASE_URL`.

Configure environment variables separately for Production and Preview:

- `DATABASE_URL`: plain `postgresql://` connection URL (the expense API converts
  it to the asyncpg dialect; Prisma cannot use `postgresql+asyncpg://`). Prefer the provider's pooled URL
  and follow its TLS requirements. Use a direct URL for migration commands if
  the provider requires one.
- `OPENAI_API_KEY` for the expense agent.
- `APP_ENV=production`, `COOKIE_SECURE=true`, strong independent `JWT_SECRET`
  and `REFRESH_TOKEN_PEPPER` values, and matching `JWT_ISSUER` and `JWT_AUDIENCE`
  for both APIs. Set `ALLOWED_ORIGINS` and `FRONTEND_URL` to the deployment's
  public origin. Cookie names must also agree across the APIs.
- `KAFKA_BOOTSTRAP_SERVERS`, `KAFKA_USERNAME`, `KAFKA_PASSWORD`,
  `KAFKA_SASL_MECHANISM=SCRAM-SHA-512`, and
  `KAFKA_ALLOW_LOCAL_PLAINTEXT=false` for the workers.
- `BREVO_SMTP_HOST`, `BREVO_SMTP_PORT`, `BREVO_SMTP_USER`,
  `BREVO_SMTP_PASSWORD`, `BREVO_FROM_EMAIL`, and `BREVO_FROM_NAME` for email.
- Optional `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` for notifications.

Create Kafka topics `expense.created.v1` and `expense.created.v1.dlq` before
starting workers; the consumer disables automatic topic creation. Use separate
brokers or isolated Kafka environments for previews: the consumer uses the
fixed group `notification-server-v1`, so sharing a broker would mix preview and
production consumption and email delivery. Confirm that the broker and SMTP
provider accept connections from the selected daemon region.

## Build, migrate, and verify

Vercel builds each HTTP service independently. The workforce service explicitly
generates Prisma Client before building to avoid stale generated clients from
an install cache. The contracts package exports committed TypeScript sources;
the web build does not fetch OpenAPI from a running backend.

Apply migrations once against the target database before promoting a release:

```sh
cd apps/expense-api
uv run alembic upgrade head
```

```sh
cd apps/workforce-api
pnpm exec prisma migrate deploy
```

Supply target environment variables to those commands. Migrations intentionally
run outside request handlers and builds; the Vercel deployment does not execute
the Railway Docker startup command that previously applied Prisma migrations.

With a current Vercel CLI, test from the repository root:

```sh
vercel dev
```

For local mode without cloud authentication, use `vercel dev --local`. Supply
the backend environment to the CLI (the database module reads `DATABASE_URL`
directly rather than loading `.env` itself). Ensure the supplied URL uses
`postgresql://`, not the SQLAlchemy-specific `postgresql+asyncpg://`. For example:

```sh
uv run --env-file apps/expense-api/.env -- vercel dev --local
```

Service bindings are supplied automatically. `vercel dev` does not run daemons;
run those separately using Docker or the existing local worker commands.
Native `pnpm dev` continues to use local URLs from `apps/web/.env`.
Use local Kafka and database settings for workers.
Do not point a local verification run at production data or email recipients.

After deploying a preview, verify registration/login and cookie refresh,
expense reads/writes, workforce requests, and a streamed CopilotKit response.
Create one expense for a test account with a test notification recipient and
check the relay, Kafka consumption, and email delivery. Verify the backend
routes cannot be reached directly through the public domain. Unit tests and a
schema check do not replace this deployment smoke test.
