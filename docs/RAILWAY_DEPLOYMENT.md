# Railway deployment

Deploy the repository as four services in one Railway project: PostgreSQL,
`expense-api`, `workforce-api`, and `web`. Keeping them in one project allows the application
services to use Railway's private network.

## PostgreSQL

Create a Railway PostgreSQL service. Do not expose it publicly unless local
administration requires it.

## Backend service

Create a service from this repository and configure:

- Root directory: `/`
- Dockerfile: `/apps/expense-api/Dockerfile`
- Builder: Dockerfile
- Healthcheck path: `/agents/expense/health`
- Pre-deploy command: `alembic upgrade head`

Set these variables:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
OPENAI_API_KEY=<secret>
```

Replace `Postgres` in the reference if the database service has a different
name. Generate a public domain only if clients outside the Railway project need
to call the backend directly.

## Workforce service

Create a service with root directory `/` and Dockerfile
`/apps/workforce-api/Dockerfile`. Point `DATABASE_URL` at the workforce
database and use the same JWT issuer, audience, and signing secret as the
expense API.

## Web service

Create another service from the same repository and configure:

- Root directory: `/`
- Dockerfile: `/apps/web/Dockerfile`
- Builder: Dockerfile
- Healthcheck path: `/`

Set `BACKEND_AGENT_URL` to the backend's private address, including the agent
path. If the backend service is named `backend`, use:

```text
BACKEND_AGENT_URL=http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:${{backend.PORT}}/agents/expense
```

Generate a public domain for the frontend service. Railway supplies `PORT` to
both containers; the Docker commands bind their servers to `0.0.0.0` and use
that value automatically.

## Deployment order

1. Deploy PostgreSQL.
2. Deploy both APIs and confirm their healthchecks pass.
3. Deploy the web application and open its generated public domain.

The backend pre-deploy command applies Alembic migrations before a new
deployment starts serving traffic. Application startup intentionally does not
run migrations, avoiding duplicate migration attempts when the service scales.
