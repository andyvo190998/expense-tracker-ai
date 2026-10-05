# Authentication and Per-User ACL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared demo identity with self-hosted email/password authentication, rotating JWT cookie sessions, role gates, and strict owner scoping across REST, analytics, the agent, and the frontend.

**Architecture:** FastAPI owns authentication, Argon2id password verification, JWT issuance, refresh-token rotation, CSRF enforcement, and authorization. Existing financial services continue taking an explicit `user_id`; HTTP dependencies and a request-local agent principal supply that ID after verification. Next.js remains a same-origin browser facade that forwards cookies and CSRF headers, bootstraps `/auth/me`, and renders merchant/admin surfaces while backend checks remain authoritative.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy async, Alembic, PyJWT, pwdlib/Argon2, PostgreSQL, pytest, Next.js 16, TypeScript, React 19, TanStack Query, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-05-authentication-acl-design.md`

## Global Constraints

- Financial data is always owner-scoped; admins never gain access to another user's expenses, analytics, categories, or agent conversations.
- Persisted roles are exactly `admin` and `merchant`; visitor is the unauthenticated state.
- Public registration always creates a merchant and never accepts a role or user ID.
- Access and refresh tokens are HttpOnly cookies and never appear in JSON, logs, or browser storage.
- Every authenticated mutation enforces double-submit CSRF validation.
- Foreign financial IDs return `404`; missing/invalid authentication returns `401`; role denial returns `403`.
- The LLM and frontend cannot provide or override trusted identity.
- Passwords use Argon2id; raw passwords and refresh tokens are never persisted.
- Use PostgreSQL-compatible migrations and preserve existing financial rows.
- Add no shared-account, password-reset, email-verification, social-login, or impersonation behavior.

## File Structure

### Backend files to create

- `backend/app/config.py` — typed security and deployment configuration.
- `backend/app/auth_types.py` — dependency-free role, claims, and principal value types.
- `backend/app/security.py` — password hashing, JWT encoding/decoding, opaque refresh-token hashing, and CSRF primitives.
- `backend/app/auth_schemas.py` — public auth/admin request and response contracts.
- `backend/app/auth_services.py` — registration, credential verification, rotation, revocation, and account-state transactions.
- `backend/app/auth_dependencies.py` — authenticated principal and role dependencies.
- `backend/app/auth_routes.py` — auth HTTP endpoints and cookie handling.
- `backend/app/admin_routes.py` — admin-only user metadata/status endpoints.
- `backend/app/agent_context.py` — request-local principal `ContextVar` for tools.
- `backend/app/agent_auth.py` — ASGI middleware protecting the AG-UI path and populating agent context.
- `backend/app/cli/create_admin.py` — operations-only initial admin provisioning command.
- `backend/migrations/versions/a3b7c91d2e4f_add_authentication_acl.py` — user auth fields and refresh-token schema.
- `backend/tests/test_security.py` — security primitive tests.
- `backend/tests/test_auth.py` — auth lifecycle and cookie/CSRF tests.
- `backend/tests/test_authorization.py` — role and two-user REST isolation tests.
- `backend/tests/test_admin.py` — admin contract and deactivation tests.
- `backend/tests/test_agent_authorization.py` — agent authentication and concurrent tool isolation tests.

### Backend files to modify

- `backend/pyproject.toml` and `backend/uv.lock` — add PyJWT and pwdlib Argon2 dependencies.
- `backend/app/models.py` — user auth fields, role enum, and refresh-token model.
- `backend/app/services.py` — user lookup/admin paging helpers; financial signatures stay user-explicit.
- `backend/app/routes.py` — replace `DEMO_USER_ID` with merchant principal.
- `backend/app/schemas.py` — no identity fields; retain financial contracts.
- `backend/tools/expenses.py` — read trusted request-local principal instead of demo identity.
- `backend/main.py` — mount auth/admin routers, CORS, and agent auth middleware.
- `backend/tests/conftest.py` — authenticated users, cookies, CSRF, and database fixtures.
- Existing backend financial/agent tests — authenticate requests and bind tool principals.
- `backend/.env.example`, `backend/README.md` — document safe configuration and admin provisioning.

### Frontend files to create

- `frontend/src/lib/backend-proxy.ts` — same-origin proxy helper that forwards auth/CSRF and `Set-Cookie` safely.
- `frontend/src/lib/auth-types.ts` — `AuthUser`, role, and auth error contracts.
- `frontend/src/lib/auth-api.ts` — credentialed auth calls and one-refresh retry logic.
- `frontend/src/lib/auth-api.test.ts` — fetch, CSRF, refresh, and retry tests.
- `frontend/src/contexts/auth-context.tsx` — session bootstrap and auth actions.
- `frontend/src/contexts/auth-context.test.tsx` — provider state tests.
- `frontend/src/components/auth/require-role.tsx` — client UX gate for merchant/admin surfaces.
- `frontend/src/components/auth/require-role.test.tsx` — loading/redirect/forbidden tests.
- `frontend/src/app/(auth)/sign-in/components/login-form-1.test.tsx` — login behavior tests.
- `frontend/src/app/(auth)/sign-up/components/signup-form-1.test.tsx` — registration behavior tests.
- `frontend/src/components/nav-user.test.tsx` — logout behavior tests.
- `frontend/src/app/api/auth/[action]/route.ts` — auth facade for csrf/register/login/refresh/logout/me.
- `frontend/src/app/api/admin/users/route.ts` — admin list facade.
- `frontend/src/app/api/admin/users/[userId]/status/route.ts` — admin status facade.
- `frontend/src/app/(dashboard)/admin/users/page.tsx` — real admin user-management page.
- `frontend/src/app/(dashboard)/admin/users/page.test.tsx` — admin page contract tests.
- `frontend/vitest.config.ts` and `frontend/src/test/setup.ts` — React test environment.

### Frontend files to modify

- `frontend/package.json` and `frontend/pnpm-lock.yaml` — add Vitest/Testing Library scripts and dependencies.
- `frontend/src/app/layout.tsx` — mount `AuthProvider` inside common providers.
- `frontend/src/app/(dashboard)/layout.tsx` — require an authenticated role before dashboard rendering.
- `frontend/src/app/copilot-provider.tsx` — expose chat only to merchants.
- `frontend/src/app/api/copilotkit/[[...slug]]/route.ts` — construct a request-specific authenticated agent proxy.
- `frontend/src/app/api/expenses/route.ts` and `frontend/src/app/api/expenses/by-category/route.ts` — use shared credential-forwarding proxy.
- `frontend/src/hooks/use-expenses.ts` and `frontend/src/hooks/use-category-expenses.ts` — use the authenticated fetch client.
- `frontend/src/app/(auth)/sign-in/components/login-form-1.tsx` — real login submission and errors.
- `frontend/src/app/(auth)/sign-up/components/signup-form-1.tsx` — real registration, matching backend validation.
- `frontend/src/components/nav-user.tsx` and `frontend/src/components/app-sidebar.tsx` — live identity, role-aware links, and logout.
- `frontend/.env.example` — backend origin only; no secret JWT material.
- `ARCHITECTURE.md`, `docs/PRODUCT_SPEC.md`, `docs/AGENT_CONTRACTS.md`, and `docs/IMPLEMENTATION_PLAN.md` — record the shipped auth boundary and completed milestone.

## Review Focus

- Two simultaneous refresh requests with the same token: one succeeds; the other detects replay and revokes the family without creating two valid successors. Covered in Task 3.
- Valid merchant credentials paired with another merchant's expense/category UUID: return `404` and reveal no foreign fields. Covered in Task 4.
- Concurrent agent calls from two merchants: each tool sees only its own request-local principal. Covered in Task 5.
- Access expiry during a browser request: refresh exactly once, retry exactly once, and never loop after refresh failure. Covered in Task 6.
- Deactivation while an access token remains unexpired: the next request fails and every refresh family is revoked. Covered in Task 4.

---

### Task 1: Security Configuration and Cryptographic Primitives

**Files:**
- Create: `backend/app/config.py`
- Create: `backend/app/auth_types.py`
- Create: `backend/app/security.py`
- Create: `backend/tests/test_security.py`
- Modify: `backend/pyproject.toml`
- Modify: `backend/uv.lock`
- Modify: `backend/.env.example`

**Interfaces:**
- Produces: `UserRole`, `AccessClaims`, `Principal`, `Settings`, `get_settings()`, `PasswordHasher`, `create_access_token(user_id, role, now)`, `decode_access_token(token, now)`, `new_refresh_token()`, `hash_refresh_token(token)`, `new_csrf_token()`, and `constant_time_equal(left, right)`.
- Consumes: environment variables only; no database access.

- [ ] **Step 1: Add dependencies and write failing primitive/config tests**

Run `cd backend && uv add 'pwdlib[argon2]' PyJWT email-validator`, then create tests that pin the public behavior:

```python
def test_passwords_are_argon2id_hashed_and_verified():
    encoded = password_hasher.hash("correct horse battery staple")
    assert encoded.startswith("$argon2id$")
    assert password_hasher.verify("correct horse battery staple", encoded)
    assert not password_hasher.verify("wrong", encoded)


def test_access_token_requires_expected_issuer_audience_and_type(settings):
    token = create_access_token(USER_ID, UserRole.MERCHANT, now=NOW)
    claims = decode_access_token(token, now=NOW)
    assert claims.sub == USER_ID
    assert claims.role is UserRole.MERCHANT
    assert claims.token_type == "access"


def test_refresh_hash_is_deterministic_without_storing_raw_token():
    raw = new_refresh_token()
    assert hash_refresh_token(raw) == hash_refresh_token(raw)
    assert raw not in hash_refresh_token(raw)


def test_production_rejects_short_or_default_signing_secret(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "change-me")
    with pytest.raises(ValidationError):
        Settings()
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cd backend && uv run pytest tests/test_security.py -q`

Expected: collection/import failure because `app.config` and `app.security` do not exist.

- [ ] **Step 3: Implement typed settings and security primitives**

Use `pydantic-settings` for exact environment names and safe defaults only in test/development. Put dependency-free shared types in `auth_types.py` and implement immutable claims/principal types:

```python
@dataclass(frozen=True)
class AccessClaims:
    sub: UUID
    role: UserRole
    jti: UUID
    issued_at: datetime
    expires_at: datetime
    token_type: Literal["access"]


@dataclass(frozen=True)
class Principal:
    user_id: UUID
    role: UserRole


def hash_refresh_token(token: str) -> str:
    return hmac.new(
        settings.refresh_token_pepper.encode(),
        token.encode(),
        hashlib.sha256,
    ).hexdigest()
```

Encode and validate `sub`, `role`, `iat`, `nbf`, `exp`, `jti`, `iss`, `aud`, and `type`; reject wrong algorithms and token types. Keep cookie names, lifetimes, same-site policy, secure flag, allowed origins, and public-registration flag in `Settings`.

- [ ] **Step 4: Run security tests and backend lint**

Run: `cd backend && uv run pytest tests/test_security.py -q && uv run ruff check app/config.py app/auth_types.py app/security.py tests/test_security.py`

Expected: all focused tests pass and Ruff exits 0.

- [ ] **Step 5: Commit the security foundation**

```bash
git add backend/pyproject.toml backend/uv.lock backend/.env.example backend/app/config.py backend/app/auth_types.py backend/app/security.py backend/tests/test_security.py
git commit -m "feat(auth): add security configuration and primitives"
```

### Task 2: Authentication Persistence and Migration

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/migrations/versions/a3b7c91d2e4f_add_authentication_acl.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_auth_models.py`

**Interfaces:**
- Consumes: password hashes and token hashes produced by Task 1.
- Produces: extended `User` and `RefreshToken` SQLAlchemy models using Task 1's `UserRole`, with database constraints.

- [ ] **Step 1: Write failing schema and migration tests**

Add tests for metadata and relational constraints:

```python
def test_auth_schema_is_registered():
    users = Base.metadata.tables["users"]
    refresh_tokens = Base.metadata.tables["refresh_tokens"]
    assert {"password_hash", "role", "is_active", "updated_at"} <= set(users.c)
    assert refresh_tokens.c.token_hash.unique
    assert refresh_tokens.c.user_id.foreign_keys
    assert refresh_tokens.c.family_id.index


async def test_refresh_successor_and_user_cascade(session):
    user = authenticated_user()
    first = refresh_record(user_id=user.id)
    second = refresh_record(user_id=user.id, family_id=first.family_id)
    first.replaced_by_id = second.id
    session.add_all([user, first, second])
    await session.commit()
    await session.delete(user)
    await session.commit()
    assert await session.scalar(select(func.count(RefreshToken.id))) == 0
```

Add a migration smoke test that upgrades an existing pre-auth schema containing a user and expense, verifies the financial row survives, verifies required auth columns are populated, and downgrades only in an empty disposable database.

- [ ] **Step 2: Run model tests and verify RED**

Run: `cd backend && uv run pytest tests/test_auth_models.py -q`

Expected: failure because `RefreshToken` and the user authentication columns do not exist.

- [ ] **Step 3: Implement models and generate the Alembic revision**

Define:

```python
class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id: Mapped[UUID]
    user_id: Mapped[UUID]
    family_id: Mapped[UUID]
    token_hash: Mapped[str]
    expires_at: Mapped[datetime]
    created_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]
    replaced_by_id: Mapped[UUID | None]
```

The migration adds user columns in a data-safe sequence. For every legacy user, generate an unguessable random password and Argon2id hash during migration, assign `merchant`, and mark active; then make the required fields non-null. This preserves rows while making legacy accounts inaccessible until deliberately reset outside this scope. Add role/check, unique token hash, family/user/expiry indexes, and successor/user foreign keys.

- [ ] **Step 4: Run schema/migration tests and existing database tests**

Run: `cd backend && uv run pytest tests/test_auth_models.py tests/test_expenses.py -q && uv run ruff check app/models.py migrations/versions tests/test_auth_models.py`

Expected: all selected tests pass; existing expense constraints still pass.

- [ ] **Step 5: Commit persistence**

```bash
git add backend/app/models.py backend/migrations/versions backend/tests/conftest.py backend/tests/test_auth_models.py
git commit -m "feat(auth): persist users and refresh sessions"
```

### Task 3: Registration, Login, Refresh Rotation, Logout, and CSRF

**Files:**
- Create: `backend/app/auth_schemas.py`
- Create: `backend/app/auth_services.py`
- Create: `backend/app/auth_routes.py`
- Modify: `backend/app/services.py`
- Create: `backend/tests/test_auth.py`
- Modify: `backend/main.py`

**Interfaces:**
- Consumes: `Settings` and security functions from Task 1; `User`/`RefreshToken` from Task 2.
- Produces: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/csrf`; `AuthUserResponse`; `SessionTokens`; `register_user`, `authenticate_user`, `rotate_refresh_token`, `revoke_refresh_token`.

- [ ] **Step 1: Write failing registration/login and cookie tests**

Pin normalized email, forced role, generic failures, inactive denial, non-token JSON, and cookie attributes:

```python
def test_register_normalizes_email_and_forces_merchant(auth_client):
    auth_client.get("/auth/csrf")
    response = auth_client.post(
        "/auth/register",
        headers=csrf_header(auth_client),
        json={"email": "  USER@Example.COM ", "name": "User", "password": VALID_PASSWORD},
    )
    assert response.status_code == 201
    assert response.json()["email"] == "user@example.com"
    assert response.json()["role"] == "merchant"
    assert "token" not in response.text.lower()
    assert response.cookies["access_token"]
    assert response.cookies["refresh_token"]


@pytest.mark.parametrize("email,password", [("missing@example.com", VALID_PASSWORD), ("user@example.com", "wrong password")])
def test_login_uses_same_invalid_credentials_error(auth_client, email, password):
    response = post_with_csrf(auth_client, "/auth/login", {"email": email, "password": password})
    assert response.status_code == 401
    assert response.json() == {"code": "INVALID_CREDENTIALS", "message": "Invalid email or password."}
```

- [ ] **Step 2: Run auth tests and verify RED**

Run: `cd backend && uv run pytest tests/test_auth.py -q`

Expected: `404` for `/auth/csrf` and missing auth modules.

- [ ] **Step 3: Implement schemas, services, routes, and cookie helpers**

Use narrow schemas:

```python
class RegisterRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=12, max_length=1024)


class AuthUserResponse(BaseModel):
    id: UUID
    email: str
    name: str
    role: UserRole
    is_active: bool
```

`GET /auth/csrf` sets/rotates the readable CSRF cookie. Mutating auth routes compare it with `X-CSRF-Token`. Registration/login create a refresh family and set access/refresh cookies only after commit. Logout attempts revocation, always clears all auth cookies, and returns `204`.

- [ ] **Step 4: Add failing refresh rotation, concurrency, replay, and rollback tests**

```python
def test_refresh_rotates_and_replay_revokes_family(auth_client):
    login(auth_client)
    old_refresh = auth_client.cookies["refresh_token"]
    first = refresh_with_csrf(auth_client)
    assert first.status_code == 200
    new_refresh = auth_client.cookies["refresh_token"]
    assert new_refresh != old_refresh
    replay_client = client_with_cookie("refresh_token", old_refresh)
    replay_client.get("/auth/csrf")
    assert refresh_with_csrf(replay_client).status_code == 401
    assert refresh_with_csrf(auth_client).status_code == 401


async def test_concurrent_refresh_creates_only_one_valid_successor(...):
    results = await asyncio.gather(refresh_once(raw), refresh_once(raw))
    assert sorted(result.status for result in results) == ["replayed", "rotated"]
    assert await count_unrevoked_family_tokens(session, family_id) <= 1
```

Also force commit failures for registration and rotation; assert no success cookies are emitted and sessions are rolled back.

- [ ] **Step 5: Run rotation tests and verify RED**

Run: `cd backend && uv run pytest tests/test_auth.py -k 'refresh or rollback' -q`

Expected: failures because rotation locking, replay revocation, and rollback behavior are not implemented.

- [ ] **Step 6: Implement transactional rotation and revocation**

Lock the token record with `SELECT ... FOR UPDATE`, compare expiry in UTC, revoke the current record, create one successor, and commit once. If a revoked token has `replaced_by_id`, revoke every record in its family before returning a replay error. Treat unique/locking conflicts as replay-safe failures. Load `is_active` before issuing any token.

- [ ] **Step 7: Run the complete auth tests and lint**

Run: `cd backend && uv run pytest tests/test_auth.py -q && uv run ruff check app/auth_schemas.py app/auth_services.py app/auth_routes.py app/services.py tests/test_auth.py`

Expected: registration/login/refresh/logout/CSRF tests pass with no raw token in response bodies.

- [ ] **Step 8: Commit the auth lifecycle**

```bash
git add backend/app/auth_schemas.py backend/app/auth_services.py backend/app/auth_routes.py backend/app/services.py backend/main.py backend/tests/test_auth.py
git commit -m "feat(auth): add rotating cookie sessions"
```

### Task 4: REST Ownership, Role Gates, and Admin API

**Files:**
- Create: `backend/app/auth_dependencies.py`
- Create: `backend/app/admin_routes.py`
- Modify: `backend/app/routes.py`
- Modify: `backend/app/services.py`
- Modify: `backend/main.py`
- Create: `backend/tests/test_authorization.py`
- Create: `backend/tests/test_admin.py`
- Modify: `backend/tests/test_expenses.py`

**Interfaces:**
- Consumes: access cookie decoder and current active `User`.
- Produces: `current_principal`, `require_roles(*roles)`, `GET /admin/users`, and `PATCH /admin/users/{user_id}/status`, using Task 1's `Principal(user_id: UUID, role: UserRole)`.

- [ ] **Step 1: Write failing authentication/status-code tests**

```python
def test_expenses_require_merchant(client, merchant_client, admin_client):
    assert client.get("/expenses").status_code == 401
    assert admin_client.get("/expenses").status_code == 403
    assert merchant_client.get("/expenses").status_code == 200


def test_foreign_expense_and_category_are_indistinguishable_from_missing(merchant_a_client, merchant_b_data):
    assert merchant_a_client.get(f"/expenses/{merchant_b_data.expense_id}").status_code == 404
    response = post_with_csrf(merchant_a_client, "/expenses", expense_payload(category_id=merchant_b_data.category_id))
    assert response.status_code == 404
    assert "foreign" not in response.text.lower()
```

Cover list, get, create, update, delete, category aggregation, invalid CSRF, expired access, deactivated user with unexpired access, and exact `401/403/404` distinctions.

- [ ] **Step 2: Run authorization tests and verify RED**

Run: `cd backend && uv run pytest tests/test_authorization.py -q`

Expected: unauthenticated requests still use `DEMO_USER_ID`, so status assertions fail.

- [ ] **Step 3: Implement principal/role dependencies and replace demo identity**

Use the immutable Task 1 boundary:

```python
MerchantPrincipal = Annotated[Principal, Depends(require_roles(UserRole.MERCHANT))]
```

Every financial handler passes `principal.user_id` to services. Apply CSRF to `POST`, `PATCH`, and `DELETE`. Remove runtime imports of `DEMO_USER_ID` from routes. Preserve validation and response schemas.

- [ ] **Step 4: Run REST authorization tests and existing expense tests**

Run: `cd backend && uv run pytest tests/test_authorization.py tests/test_expenses.py -q`

Expected: all pass after existing tests use authenticated clients and CSRF helpers.

- [ ] **Step 5: Write failing admin/deactivation tests**

```python
def test_admin_lists_identity_metadata_only(admin_client):
    response = admin_client.get("/admin/users")
    assert response.status_code == 200
    assert set(response.json()["items"][0]) == {"id", "email", "name", "role", "is_active", "created_at", "updated_at"}


def test_deactivation_revokes_refresh_and_blocks_unexpired_access(admin_client, merchant_client, merchant_id, session):
    response = patch_with_csrf(admin_client, f"/admin/users/{merchant_id}/status", {"is_active": False})
    assert response.status_code == 200
    assert merchant_client.get("/auth/me").status_code == 401
    assert refresh_with_csrf(merchant_client).status_code == 401
    assert all_tokens_revoked(session, merchant_id)
```

Also assert merchants receive `403`, unauthenticated callers receive `401`, admins cannot call financial endpoints, pagination bounds are enforced, and no admin response includes finance/password/token fields.

- [ ] **Step 6: Run admin tests and verify RED**

Run: `cd backend && uv run pytest tests/test_admin.py -q`

Expected: `404` because the admin router does not exist.

- [ ] **Step 7: Implement minimal admin services and router**

Add deterministic pagination ordered by creation time and ID. Status changes run transactionally; deactivation updates `is_active` and revokes all live refresh tokens. Do not add role mutation or financial joins.

- [ ] **Step 8: Run authorization/admin suites and lint**

Run: `cd backend && uv run pytest tests/test_authorization.py tests/test_admin.py tests/test_expenses.py -q && uv run ruff check app/auth_dependencies.py app/admin_routes.py app/routes.py app/services.py tests/test_authorization.py tests/test_admin.py`

Expected: all selected tests and Ruff pass.

- [ ] **Step 9: Commit authorization adapters**

```bash
git add backend/app/auth_dependencies.py backend/app/admin_routes.py backend/app/routes.py backend/app/services.py backend/main.py backend/tests/test_authorization.py backend/tests/test_admin.py backend/tests/test_expenses.py
git commit -m "feat(auth): enforce merchant ownership and admin roles"
```

### Task 5: Request-Scoped Agent Authorization

**Files:**
- Create: `backend/app/agent_context.py`
- Create: `backend/app/agent_auth.py`
- Modify: `backend/tools/expenses.py`
- Modify: `backend/main.py`
- Modify: `backend/tests/test_expense_tool.py`
- Modify: `backend/tests/test_agent.py`
- Create: `backend/tests/test_agent_authorization.py`
- Delete: `backend/app/context.py` after all references are removed.

**Interfaces:**
- Consumes: `Principal` and access-token verification from Task 4.
- Produces: `bind_agent_principal(principal)` context manager, `get_agent_principal() -> Principal`, and `AgentAuthMiddleware` for `/agents/expense`.

- [ ] **Step 1: Write failing tool isolation tests**

Bind a principal explicitly around direct tool calls and assert tool schemas reject model-supplied identity:

```python
async def test_tool_uses_bound_principal_and_rejects_user_id(tool_db):
    with bind_agent_principal(Principal(MERCHANT_A_ID, UserRole.MERCHANT)):
        result = await add_expense.ainvoke(EXPENSE_INPUT)
    assert result["status"] == "created"
    assert await expense_owner(tool_db, UUID(result["expense"]["id"])) == MERCHANT_A_ID
    with pytest.raises(ValidationError):
        await add_expense.ainvoke(EXPENSE_INPUT | {"user_id": str(MERCHANT_B_ID)})


async def test_concurrent_tools_do_not_leak_principals(two_user_tool_db):
    a, b = await asyncio.gather(run_find_as(MERCHANT_A_ID), run_find_as(MERCHANT_B_ID))
    assert {item["merchant"] for item in a["expenses"]} == {"A only"}
    assert {item["merchant"] for item in b["expenses"]} == {"B only"}
```

Repeat owner assertions for find, update, delete, total, and category aggregation.

- [ ] **Step 2: Run tool isolation tests and verify RED**

Run: `cd backend && uv run pytest tests/test_agent_authorization.py -q`

Expected: all tools still act as the demo user or the context module is missing.

- [ ] **Step 3: Implement request-local context and convert every tool**

Use a `ContextVar[Principal | None]` with token reset in `finally`:

```python
@contextmanager
def bind_agent_principal(principal: Principal):
    token = _principal.set(principal)
    try:
        yield
    finally:
        _principal.reset(token)
```

At the start of each tool, call `get_agent_principal()`, require `merchant`, and pass its user ID to every service/category lookup. Do not add principal fields to tool schemas. Update docstrings to say “authenticated merchant,” not “demo user.”

- [ ] **Step 4: Add failing AG-UI endpoint authentication tests**

```python
def test_agent_endpoint_rejects_visitor_and_admin(client, admin_client, valid_agent_payload):
    assert client.post("/agents/expense", json=valid_agent_payload).status_code == 401
    assert admin_client.post("/agents/expense", json=valid_agent_payload).status_code == 403


def test_agent_middleware_clears_context_after_request(merchant_client, valid_agent_payload):
    merchant_client.post("/agents/expense", json=valid_agent_payload)
    with pytest.raises(MissingAgentPrincipal):
        get_agent_principal()
```

Mock graph execution so endpoint authentication is tested without an OpenAI call.

- [ ] **Step 5: Run endpoint tests and verify RED**

Run: `cd backend && uv run pytest tests/test_agent_authorization.py -k endpoint -q`

Expected: the generated AG-UI route accepts unauthenticated requests.

- [ ] **Step 6: Add narrowly scoped agent auth middleware**

For requests whose path equals or starts with `/agents/expense`, authenticate the access cookie, load the active user, require `merchant`, bind the principal around the downstream ASGI call, and reset it after streamed completion. All other paths pass through untouched. Return the same structured `401/403` error contracts as dependencies.

- [ ] **Step 7: Run all agent/tool tests and remove demo context**

Run: `cd backend && rg -n 'DEMO_USER_ID|demo user' app tools agent.py main.py && uv run pytest tests/test_expense_tool.py tests/test_agent.py tests/test_agent_authorization.py -q && uv run ruff check app/agent_context.py app/agent_auth.py tools/expenses.py tests/test_agent_authorization.py`

Expected: `rg` returns no runtime matches (test fixture names may remain outside searched paths); all tests and Ruff pass.

- [ ] **Step 8: Commit agent isolation**

```bash
git add backend/app/agent_context.py backend/app/agent_auth.py backend/tools/expenses.py backend/main.py backend/tests/test_expense_tool.py backend/tests/test_agent.py backend/tests/test_agent_authorization.py
git rm backend/app/context.py
git commit -m "feat(auth): scope agent tools to authenticated merchants"
```

### Task 6: Frontend Auth Facade, Session State, and Credential Forwarding

**Files:**
- Create: `frontend/src/lib/backend-proxy.ts`
- Create: `frontend/src/lib/auth-types.ts`
- Create: `frontend/src/lib/auth-api.ts`
- Create: `frontend/src/lib/auth-api.test.ts`
- Create: `frontend/src/contexts/auth-context.tsx`
- Create: `frontend/src/contexts/auth-context.test.tsx`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/app/api/auth/[action]/route.ts`
- Modify: `frontend/src/app/api/expenses/route.ts`
- Modify: `frontend/src/app/api/expenses/by-category/route.ts`
- Modify: `frontend/src/app/api/copilotkit/[[...slug]]/route.ts`
- Modify: `frontend/src/hooks/use-expenses.ts`
- Modify: `frontend/src/hooks/use-category-expenses.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml`

**Interfaces:**
- Consumes: backend auth cookies and JSON contracts from Tasks 3–5.
- Produces: `AuthUser`, `authFetch(input, init)`, `AuthProvider`, `useAuth()`, and same-origin `/api/auth/*` routes.

- [ ] **Step 1: Add frontend test dependencies and write failing fetch/proxy tests**

Run: `cd frontend && pnpm add -D vitest jsdom @testing-library/react @testing-library/jest-dom`

Update `test` to run the existing Node tests and Vitest, then add tests:

```typescript
it("adds credentials and CSRF to mutations", async () => {
  document.cookie = "csrf_token=csrf-value";
  await authFetch("/api/expenses/1", { method: "PATCH", body: "{}" });
  expect(fetchMock).toHaveBeenCalledWith("/api/expenses/1", expect.objectContaining({
    credentials: "include",
    headers: expect.objectContaining({ "X-CSRF-Token": "csrf-value" }),
  }));
});


it("refreshes and retries once after 401", async () => {
  fetchMock.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(200)).mockResolvedValueOnce(response(200));
  expect((await authFetch("/api/expenses")).status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});


it("does not loop when refresh fails", async () => {
  fetchMock.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(401));
  expect((await authFetch("/api/expenses")).status).toBe(401);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
```

Test `backend-proxy.ts` separately with synthetic `NextRequest` values: it forwards `cookie`, `X-CSRF-Token`, method, query, and body; returns every backend `Set-Cookie`; and never forwards hop-by-hop headers.

- [ ] **Step 2: Run frontend focused tests and verify RED**

Run: `cd frontend && pnpm vitest run src/lib/auth-api.test.ts`

Expected: missing `auth-api` and proxy modules.

- [ ] **Step 3: Implement proxy helper, auth API client, and route facades**

Use one allowlisted proxy function rather than accepting arbitrary destination URLs:

```typescript
export async function proxyToBackend(request: NextRequest, backendPath: string): Promise<Response>
```

Create an explicit action map for `csrf`, `register`, `login`, `refresh`, `logout`, and `me`. Copy multiple `Set-Cookie` values without coalescing them. Convert expense proxies to the helper.

For CopilotKit, construct the `CopilotRuntime` and `HttpAgent` inside the route request handler. Provide request-specific `cookie` and `X-CSRF-Token` headers to `HttpAgent`; do not keep user headers in a module-global agent instance.

- [ ] **Step 4: Run fetch/proxy tests and type-check**

Run: `cd frontend && pnpm vitest run src/lib/auth-api.test.ts && pnpm typecheck`

Expected: focused tests pass and TypeScript exits 0.

- [ ] **Step 5: Write failing AuthProvider tests**

```tsx
it("bootstraps the current user and exposes merchant state", async () => {
  authApi.me.mockResolvedValue(MERCHANT);
  render(<AuthProvider><Probe /></AuthProvider>);
  expect(screen.getByText("loading")).toBeInTheDocument();
  expect(await screen.findByText("merchant:user@example.com")).toBeInTheDocument();
});


it("becomes unauthenticated after refresh failure", async () => {
  authApi.me.mockRejectedValue(new AuthError(401));
  render(<AuthProvider><Probe /></AuthProvider>);
  expect(await screen.findByText("unauthenticated")).toBeInTheDocument();
});
```

- [ ] **Step 6: Run provider tests and verify RED**

Run: `cd frontend && pnpm vitest run src/contexts/auth-context.test.tsx`

Expected: missing provider module.

- [ ] **Step 7: Implement session provider and update data hooks**

Expose:

```typescript
type AuthContextValue = {
  status: "loading" | "authenticated" | "unauthenticated";
  user: AuthUser | null;
  login(input: LoginInput): Promise<AuthUser>;
  register(input: RegisterInput): Promise<AuthUser>;
  logout(): Promise<void>;
};
```

Mount it in root layout. Use `authFetch` in expense hooks, preserve existing query keys, and clear user-scoped query data on logout or identity change.

- [ ] **Step 8: Run frontend unit tests, lint, and type-check**

Run: `cd frontend && pnpm test && pnpm lint && pnpm typecheck`

Expected: all existing and new tests pass; lint/type-check exit 0.

- [ ] **Step 9: Commit the frontend auth transport**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/vitest.config.ts frontend/src/test frontend/src/lib/backend-proxy.ts frontend/src/lib/auth-types.ts frontend/src/lib/auth-api.ts frontend/src/lib/auth-api.test.ts frontend/src/contexts/auth-context.tsx frontend/src/contexts/auth-context.test.tsx frontend/src/app/layout.tsx frontend/src/app/api frontend/src/hooks/use-expenses.ts frontend/src/hooks/use-category-expenses.ts
git commit -m "feat(auth): add frontend session and credential proxy"
```

### Task 7: Role-Aware UI, Real Auth Forms, and Admin User Management

**Files:**
- Create: `frontend/src/components/auth/require-role.tsx`
- Create: `frontend/src/components/auth/require-role.test.tsx`
- Create: `frontend/src/app/api/admin/users/route.ts`
- Create: `frontend/src/app/api/admin/users/[userId]/status/route.ts`
- Create: `frontend/src/app/(dashboard)/admin/users/page.tsx`
- Modify: `frontend/src/app/(dashboard)/layout.tsx`
- Modify: `frontend/src/app/copilot-provider.tsx`
- Modify: `frontend/src/app/(auth)/sign-in/components/login-form-1.tsx`
- Create: `frontend/src/app/(auth)/sign-in/components/login-form-1.test.tsx`
- Modify: `frontend/src/app/(auth)/sign-up/components/signup-form-1.tsx`
- Create: `frontend/src/app/(auth)/sign-up/components/signup-form-1.test.tsx`
- Modify: `frontend/src/components/nav-user.tsx`
- Create: `frontend/src/components/nav-user.test.tsx`
- Modify: `frontend/src/components/app-sidebar.tsx`
- Create: `frontend/src/app/(dashboard)/admin/users/page.test.tsx`

**Interfaces:**
- Consumes: `useAuth`, `authFetch`, and backend admin contracts.
- Produces: `<RequireRole allow={[...]}>`, functional sign-in/sign-up/logout, merchant-only chat/dashboard, and admin-only user management.

- [ ] **Step 1: Write failing role-gate tests**

```tsx
it("shows loading without rendering protected children", () => {
  mockAuth({ status: "loading", user: null });
  render(<RequireRole allow={["merchant"]}><Secret /></RequireRole>);
  expect(screen.queryByText("secret")).not.toBeInTheDocument();
});


it("redirects visitors and renders forbidden for the wrong role", async () => {
  mockAuth({ status: "unauthenticated", user: null });
  render(<RequireRole allow={["merchant"]}><Secret /></RequireRole>);
  expect(router.replace).toHaveBeenCalledWith("/auth/sign-in");
  mockAuth({ status: "authenticated", user: ADMIN });
  render(<RequireRole allow={["merchant"]}><Secret /></RequireRole>);
  expect(screen.getByText(/forbidden/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run role-gate tests and verify RED**

Run: `cd frontend && pnpm vitest run src/components/auth/require-role.test.tsx`

Expected: missing component.

- [ ] **Step 3: Implement role gates and merchant/admin composition**

Protect dashboard composition before rendering data hooks. Render CopilotKit popup only for authenticated merchants. Add the admin navigation item only for admins and merchant finance links only for merchants. Treat these as UX rules; do not encode security assumptions in client-only code.

- [ ] **Step 4: Write failing form and logout tests**

Test that login/register submit exact backend fields, display stable API errors, disable during submission, redirect merchants to the expense dashboard and admins to `/admin/users`, and invoke real logout without logging secrets or form data.

- [ ] **Step 5: Run form tests and verify RED**

Run: `cd frontend && pnpm vitest run src/app/\(auth\)/sign-in src/app/\(auth\)/sign-up src/components/nav-user.test.tsx`

Expected: template forms do not call auth actions and logout is a static link.

- [ ] **Step 6: Connect real forms and logout**

Remove demo default credentials, Google buttons, forgot-password links, and placeholder console logging because those capabilities are out of scope. Use the backend's 12-character password minimum and concatenate first/last name into the backend `name` field. Preserve accessible field errors and focus behavior.

- [ ] **Step 7: Write failing admin page tests**

Test paginated identity-only rows, activate/deactivate mutations with CSRF, query invalidation after success, disabled self-deactivation controls, and error feedback. Assert the component never renders expense or token fields.

- [ ] **Step 8: Run admin UI tests and verify RED**

Run: `cd frontend && pnpm vitest run src/app/\(dashboard\)/admin/users`

Expected: missing admin page and proxy routes.

- [ ] **Step 9: Implement admin proxy/routes/page**

Use the shared backend proxy and `authFetch`. Keep the page focused on ID, name, email, role, active state, and timestamps. Do not reuse the existing static users dataset as authoritative data.

- [ ] **Step 10: Run the full frontend verification set**

Run: `cd frontend && pnpm test && pnpm lint && pnpm typecheck && pnpm build`

Expected: tests, lint, type-check, and production build all exit 0.

- [ ] **Step 11: Commit role-aware product UI**

```bash
git add frontend/src/components/auth frontend/src/app/\(dashboard\)/layout.tsx frontend/src/app/\(dashboard\)/admin frontend/src/app/\(auth\)/sign-in frontend/src/app/\(auth\)/sign-up frontend/src/app/copilot-provider.tsx frontend/src/app/api/admin frontend/src/components/nav-user.tsx frontend/src/components/app-sidebar.tsx
git commit -m "feat(auth): add role-aware authentication UI"
```

### Task 8: Admin Provisioning, Documentation, and Full Verification

**Files:**
- Create: `backend/app/cli/__init__.py`
- Create: `backend/app/cli/create_admin.py`
- Create: `backend/tests/test_create_admin.py`
- Modify: `backend/README.md`
- Modify: `backend/.env.example`
- Modify: `frontend/.env.example`
- Modify: `ARCHITECTURE.md`
- Modify: `docs/PRODUCT_SPEC.md`
- Modify: `docs/AGENT_CONTRACTS.md`
- Modify: `docs/IMPLEMENTATION_PLAN.md`

**Interfaces:**
- Consumes: auth service password hashing and user persistence.
- Produces: `uv run python -m app.cli.create_admin` operations command and current source-of-truth documentation.

- [ ] **Step 1: Write failing provisioning tests**

```python
def test_create_admin_reads_secret_without_printing_it(cli_runner, monkeypatch, capsys):
    monkeypatch.setenv("ADMIN_EMAIL", "admin@example.com")
    monkeypatch.setenv("ADMIN_NAME", "Administrator")
    monkeypatch.setenv("ADMIN_PASSWORD", VALID_PASSWORD)
    assert cli_runner() == 0
    output = capsys.readouterr().out
    assert VALID_PASSWORD not in output
    assert load_user("admin@example.com").role is UserRole.ADMIN


def test_create_admin_is_idempotent_for_existing_admin(cli_runner):
    assert cli_runner() == 0
    assert cli_runner() == 0
    assert count_users("admin@example.com") == 1
```

Also assert the command refuses to promote an existing merchant silently and returns a non-zero code for missing/weak secret input.

- [ ] **Step 2: Run provisioning tests and verify RED**

Run: `cd backend && uv run pytest tests/test_create_admin.py -q`

Expected: missing CLI module.

- [ ] **Step 3: Implement the provisioning command**

Reuse the Task 1 password hasher and normalized email rules. Accept credentials only from environment or hidden interactive input. Print the created/existing admin email and status, never a password/hash/token. Do not expose role promotion through HTTP.

- [ ] **Step 4: Run provisioning tests and lint**

Run: `cd backend && uv run pytest tests/test_create_admin.py -q && uv run ruff check app/cli tests/test_create_admin.py`

Expected: tests and Ruff pass.

- [ ] **Step 5: Update architecture, product, agent, deployment, and milestone docs**

Document exact roles, auth endpoints, cookie/CSRF behavior, required environment variable names, local setup, migration order, initial admin provisioning, request-local agent identity, and removal of the demo user. Leave Milestone 9 marked as pending verification until Steps 6–9 succeed.

- [ ] **Step 6: Run the complete backend suite**

Run: `cd backend && uv run ruff check . && uv run pytest`

Expected: Ruff exits 0 and pytest reports zero failures. Report every unrelated/pre-existing failure by test name if the suite is not green.

- [ ] **Step 7: Run the complete frontend suite**

Run: `cd frontend && pnpm test && pnpm lint && pnpm typecheck && pnpm build`

Expected: all four commands exit 0. Report every failure rather than extrapolating from partial checks.

- [ ] **Step 8: Validate migrations and Compose configuration**

With the repository PostgreSQL service available:

```bash
docker compose config
docker compose up -d postgres
cd backend
uv run alembic upgrade head
uv run alembic current
```

Expected: Compose config is valid, PostgreSQL becomes healthy, Alembic reaches the new head revision, and existing financial rows remain. If Docker or PostgreSQL is unavailable, record the exact blocked command and do not claim migration verification.

- [ ] **Step 9: Perform security scans and acceptance checks**

Run:

```bash
rg -n "DEMO_USER_ID|localStorage.*token|sessionStorage.*token|user_id.*Field|password.*print|refresh_token.*print" backend frontend/src
git diff --check
git status --short
```

Expected: no runtime demo identity, browser token storage, model/client-selected identity, or secret logging; no whitespace errors; only intended files changed.

After all acceptance scans and full suites succeed, update `docs/IMPLEMENTATION_PLAN.md` to mark Milestone 9 complete. If any check remains blocked or failing, record that status instead.

- [ ] **Step 10: Commit documentation and provisioning**

```bash
git add backend/app/cli backend/tests/test_create_admin.py backend/README.md backend/.env.example frontend/.env.example ARCHITECTURE.md docs/PRODUCT_SPEC.md docs/AGENT_CONTRACTS.md docs/IMPLEMENTATION_PLAN.md
git commit -m "docs(auth): document ACL operations and contracts"
```

- [ ] **Step 11: Review the full branch against the specification**

Read `docs/superpowers/specs/2026-10-05-authentication-acl-design.md` acceptance criteria one by one. For each criterion, cite the enforcing test and production boundary in the final handoff. Do not mark the work complete if any criterion lacks both implementation and verification evidence.
