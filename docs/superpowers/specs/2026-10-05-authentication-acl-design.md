# Authentication and Per-User ACL Design

## Purpose

Add self-hosted email/password authentication and strict per-user ownership to
the expense tracker. Financial records remain private to their owner. Roles
control which product surfaces a user may access; they never grant access to
another user's expenses, analytics, or agent conversations.

This design replaces the runtime demo-user identity with authenticated server
context across REST endpoints, analytics, and agent tools.

## Scope

The first ACL release includes:

- self-hosted email/password registration and login;
- short-lived JWT access tokens in HttpOnly cookies;
- rotating, revocable refresh tokens in HttpOnly cookies;
- CSRF protection for cookie-authenticated mutations;
- `admin` and `merchant` roles;
- strict owner scoping for expenses, categories, analytics, and agent tools;
- a minimal admin surface for listing and activating or deactivating users;
- frontend session bootstrap, protected navigation, and role-aware screens;
- database migrations, automated tests, and deployment configuration.

The first release does not include password reset, email verification, social
login, shared accounts, organization membership, admin impersonation, or access
to another user's financial data.

## Role Semantics

### Merchant

A merchant can create, read, update, delete, and analyze only financial records
owned by their authenticated user ID. A merchant can use the expense agent,
whose tools operate with that same trusted identity.

Public registration always creates a merchant. The requested role is never
accepted from the registration payload.

### Admin

An admin can list user identity metadata and activate or deactivate accounts.
An admin cannot read or mutate any user's expenses, categories, analytics, or
agent conversations, including their own through merchant endpoints.

Admin assignment is an operations-controlled action performed through initial
provisioning or a database migration, not through public registration or a
public role-change endpoint.

### Visitor

Visitor is the unauthenticated public state, not a persisted database role. A
visitor may use public pages but cannot call authenticated financial, agent, or
administrative endpoints.

## Security Invariants

1. Authenticated identity comes only from a verified backend-issued access JWT.
2. Request bodies, query parameters, frontend context, and model-generated tool
   arguments can never select or override the trusted user ID or role.
3. Every financial query and mutation is constrained by the authenticated
   merchant's user ID.
4. Looking up a valid resource owned by another user returns `404`, preventing
   resource-existence disclosure.
5. A role grants access to product capabilities, never to another user's
   financial data.
6. Passwords and refresh tokens are never stored in plaintext.
7. Authentication tokens are never returned in JSON or exposed to browser
   JavaScript.
8. A mutation is never reported as successful unless its database transaction
   succeeds.
9. Authentication logs exclude passwords, raw tokens, cookie values, and
   financial data.
10. Deactivated users cannot establish or continue an authenticated session.

## Data Model

### Users

Extend `users` with:

- `password_hash`: required Argon2id password hash;
- `role`: constrained enum-like value, `admin` or `merchant`;
- `is_active`: boolean, default `true`;
- `updated_at`: timezone-aware timestamp.

Email addresses are trimmed and normalized to lowercase before storage and
lookup. The existing unique email constraint remains authoritative.

Existing development data must be migrated deliberately. The seeded demo user
may remain as data for local development, but its UUID has no runtime
authorization meaning and no production request falls back to it.

### Refresh Tokens

Add a `refresh_tokens` table containing:

- `id`: UUID primary key and JWT token ID;
- `user_id`: owner foreign key with cascading deletion;
- `family_id`: UUID identifying a rotation family;
- `token_hash`: unique one-way hash of the token secret;
- `expires_at`: timezone-aware expiry;
- `created_at`: timezone-aware creation timestamp;
- `revoked_at`: nullable timezone-aware revocation timestamp;
- `replaced_by_id`: nullable reference to the successor token;
- optional bounded request metadata for operational audit, excluding secrets.

Indexes support lookup by token hash, user, family, and expiry. Raw refresh
tokens are never persisted.

## Password Handling

Passwords are hashed with Argon2id through a maintained password-hashing
library. Registration enforces a documented minimum length and a generous
maximum byte length to avoid password-hashing denial-of-service inputs. The
system does not impose composition rules that encourage predictable passwords.

Login performs the same generic invalid-credentials response for unknown emails
and incorrect passwords. Password hashes may be upgraded on successful login
when hashing parameters change.

## Token and Cookie Design

### Access Token

The access JWT is short-lived and contains only:

- `sub`: authenticated user UUID;
- `role`: `admin` or `merchant`;
- `iat`, `exp`, and `nbf` timestamps;
- `jti`: unique token UUID;
- configured `iss` and `aud` values;
- a token-type claim identifying it as an access token.

Signature, issuer, audience, token type, and temporal claims are verified on
every authenticated request. The database user is loaded after verification so
deactivation and current role changes take effect immediately.

### Refresh Token

The refresh token is longer-lived, cryptographically random or signed with a
distinct purpose, and bound to a server-side refresh-token record. It is valid
only at the refresh and logout endpoints.

Refresh rotation runs in one database transaction:

1. verify and hash the presented token;
2. lock and load its server-side record;
3. reject expired or revoked records;
4. revoke the presented record;
5. create its successor in the same family;
6. issue new access and refresh cookies;
7. commit before reporting success.

Presenting a refresh token that was already rotated is treated as replay. The
entire token family is revoked, authentication cookies are cleared, and the
request returns `401`.

### Cookie Policy

Access and refresh cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` outside
explicit local development. Cookie names and paths are centralized. The refresh
cookie is scoped to authentication refresh/logout endpoints where framework
support permits; the access cookie is available to protected API routes.

Cookie domain is host-only by default. Cross-origin production deployments must
use an explicit allowlist with credentialed CORS and cannot use wildcard
origins.

## CSRF Protection

Because authentication uses cookies, all state-changing authenticated requests
require a CSRF token using the double-submit pattern. The server issues a
non-HttpOnly CSRF cookie and requires the same value in a dedicated header.
Comparison is constant-time. Login, registration, refresh, logout, financial
mutations, and admin mutations are covered as appropriate to their cookie and
session state.

SameSite cookies and origin checks provide additional defenses but do not
replace explicit CSRF validation. Safe `GET` and health endpoints do not mutate
state.

## Backend Boundaries

### Authentication Service

A focused authentication service owns password hashing, credential validation,
token issuance, refresh rotation, session revocation, and cookie-independent
domain results. HTTP handlers translate those results into cookies and response
schemas.

### Authentication Dependencies

A shared FastAPI dependency verifies the access token, loads the active user,
and returns a typed principal containing the trusted user ID and role. A role
dependency accepts an explicit set of allowed roles.

- Missing, malformed, expired, or otherwise invalid authentication returns
  `401`.
- Valid authentication without the required role returns `403`.
- A missing or foreign user-owned entity returns `404`.

### Financial REST APIs

All expense, category, and analytics endpoints require the merchant role. Route
handlers pass `principal.user_id` to existing application services. Services
continue to require an explicit user ID, keeping ownership visible at every
database boundary.

Category IDs supplied during an expense mutation must belong to the same user.
Composite constraints remain database-level defense in depth.

### Agent Endpoint and Tools

The AG-UI endpoint authenticates the HTTP request before agent execution and
places the principal in trusted server request context. Each financial tool
reads the principal from that context. Tool input schemas never contain
`user_id`, role, permission, or ownership parameters.

The expense agent is merchant-only. Unauthenticated users receive `401`; admins
receive `403`. Existing agent safety rules still apply, including confirmation
before deletion and deterministic database calculations.

The implementation must verify that request-scoped identity remains isolated
under concurrent agent requests. Global mutable identity is prohibited.

### Admin API

The first admin API supports:

- paginated user listing with ID, normalized email, name, role, active state,
  and timestamps;
- activation and deactivation of an account.

It does not return expenses, category records, analytics, conversation content,
password hashes, refresh-token hashes, or raw authentication tokens.
Deactivation revokes every refresh-token family for the target user in the same
transaction. Subsequent access-token requests fail because active user state is
checked for every request.

## HTTP Authentication Surface

The versionable API surface includes:

```text
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /auth/me

GET   /admin/users
PATCH /admin/users/{user_id}/status
```

Registration and login return a minimal user representation and set cookies.
Refresh returns the same minimal session representation and rotated cookies.
Logout is idempotent: it revokes the presented refresh token when possible,
clears all auth/CSRF cookies, and returns a no-content success response.

Public registration is configurable so production operators can disable it
without changing authorization behavior.

## Frontend Behavior

The frontend uses a small auth client and provider to:

- include browser credentials on backend requests;
- attach the CSRF header to mutations;
- call `/auth/me` when the application initializes;
- expose loading, authenticated, unauthenticated, and role state;
- refresh once after an access-token `401`, then retry the original request;
- avoid retry loops and clear local session state after refresh failure.

Public pages remain available to visitors. Merchant routes render the expense
dashboard and agent. Admin routes render user management. Client-side route
guards improve navigation and presentation but are never treated as the
security boundary; backend authorization remains authoritative.

The existing static template users page is not evidence of authorization. It
must either be adapted to the real admin contract or excluded from the secured
product navigation.

## Error Handling

Authentication errors use stable machine-readable codes with non-sensitive
messages. Expected categories include invalid credentials, inactive account,
invalid or expired access, invalid or replayed refresh token, CSRF failure,
role denial, duplicate email, validation failure, and persistence failure.

Database exceptions roll back the active transaction. Token cookies are issued
only after the corresponding persistence operation succeeds. A refresh failure
clears auth cookies. No error reveals whether a foreign expense ID or
unregistered email exists.

## Configuration and Deployment

Configuration defines:

- JWT signing key and algorithm;
- issuer and audience;
- access and refresh lifetimes;
- cookie names, security flag, and same-site policy;
- frontend origin allowlist;
- public-registration flag;
- initial admin provisioning mechanism;
- Argon2id parameters.

Secrets live only in environment variables or deployment secret stores.
Production startup rejects missing, known-default, or inadequately sized signing
secrets. Local development may explicitly disable secure cookies, but that
setting is never the production default.

Initial admin provisioning is a one-way operational command or migration that
accepts secret input through the environment or an interactive prompt. It does
not place credentials in source control or migration history.

## Migration Strategy

The migration must preserve existing local data while making authentication
requirements explicit:

1. add nullable authentication columns and the refresh-token table;
2. migrate or mark existing users using documented local-development behavior;
3. provision an admin through the operational mechanism;
4. make required columns non-null after data is valid;
5. deploy code that has no `DEMO_USER_ID` fallback.

For production-like environments, deployment must not proceed while users lack
valid role, active-state, and password/migration disposition. Rollback removes
new code paths without discarding existing financial rows; destructive schema
rollback is not automatic after tokens are issued.

## Testing Strategy

Backend tests cover:

- successful registration, normalized duplicate email rejection, password
  hashing, password bounds, and forced merchant assignment;
- login success, generic login failure, inactive accounts, and hash upgrades;
- access-token signature, issuer, audience, type, timing, and active-user checks;
- refresh rotation, concurrent refresh handling, expiry, revocation, replay
  detection, family revocation, and logout;
- cookie attributes and CSRF validation for every mutation class;
- unauthenticated `401`, role-based `403`, and foreign-resource `404` behavior;
- two-user isolation for expense list/get/create/update/delete, categories,
  analytics, and every financial agent tool;
- request-context isolation across concurrent agent calls;
- admin listing and account-state changes without financial-data exposure;
- transaction rollback and non-success responses on database failures.

Frontend tests cover:

- session bootstrap and loading behavior;
- credentialed requests and CSRF headers;
- one refresh-and-retry cycle after access expiry;
- refresh failure without an infinite retry loop;
- visitor, merchant, and admin navigation behavior;
- protected-page redirects and forbidden-state rendering.

Verification uses the repository's backend Ruff and pytest commands, frontend
lint, type-check, and test commands, Alembic migration checks, and Docker Compose
configuration validation. Checks blocked by unavailable services or secrets are
reported explicitly rather than represented as passing.

## Acceptance Criteria

1. Two merchants using the REST API, analytics, or agent can never observe or
   mutate each other's financial records.
2. The server derives identity from a verified JWT for every protected request;
   no demo-user or client-selected identity fallback remains.
3. Public registration creates only merchants, and visitors cannot call
   protected endpoints.
4. Admins can list and activate or deactivate users but cannot call merchant
   financial or agent endpoints.
5. Access tokens are short-lived HttpOnly cookies; refresh tokens rotate, are
   revocable, and trigger family revocation when reuse is detected.
6. All authenticated mutations enforce CSRF validation.
7. Foreign resource IDs return `404`, while missing authentication returns
   `401` and role denial returns `403`.
8. Deactivation blocks new protected requests and revokes refresh-token
   families.
9. Auth tokens and password material never appear in JSON responses, logs, or
   committed configuration.
10. Relevant automated checks pass, or environmental blockers are documented.
