# Expense CRUD Design

## Scope

Add the first runnable FastAPI CRUD API for expenses. Authentication, agent
tools, analytics, pagination, and migrations remain outside this change.

## API

- `POST /expenses` creates an expense and returns `201` with the stored record.
- `GET /expenses` returns the demo user's expenses, newest spending date first.
- `GET /expenses/{expense_id}` returns one expense or `404`.
- `PATCH /expenses/{expense_id}` updates only supplied fields and returns the
  stored record or `404`.
- `DELETE /expenses/{expense_id}` deletes one expense and returns `204` or
  `404`.

Request bodies never accept `user_id`. Until authentication exists, the server
uses one internal demo user ID for every operation.

## Structure

- `main.py` creates the FastAPI application and includes the expense router.
- `app/routes.py` owns HTTP parsing, status codes, and dependency injection.
- `app/services.py` owns SQLAlchemy queries and transaction boundaries.
- `app/schemas.py` defines create, partial-update, and response contracts.
- Existing `app/database.py` and `app/models.py` remain the persistence layer.

No repository interface is introduced because there is only one persistence
implementation.

## Data Flow

FastAPI validates a request with Pydantic, injects an `AsyncSession`, and calls
the service with the internal demo user ID. The service scopes every query by
both expense ID and user ID, commits mutations, refreshes returned records, and
returns the model. The route converts a missing result to HTTP `404`.

## Validation and Errors

- Amount remains a positive `Decimal`.
- IDs use UUID consistently between SQLAlchemy and Pydantic.
- PATCH rejects an empty body and applies only explicitly supplied fields.
- Database failures propagate as server errors and are never reported as
  successful writes.

## Testing

One focused API test exercises create, list, get, patch, delete, and the final
`404` through FastAPI's dependency override. It uses a temporary database
session so production PostgreSQL is not required for the check. Ruff and
pytest must pass from `backend/`.

## Deferred

- Replace the demo user ID with authenticated server context in the auth
  milestone.
- Add pagination when the collection can become large.
- Add Alembic migrations as a separate database-foundation task.
