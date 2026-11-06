# Expense Notification Server Implementation Plan

> Manual implementation guide. Each task includes an acceptance check; start with the check and commit the smallest working slice.

**Goal:** Send one Resend email to each configured recipient when a merchant successfully creates an expense.

**Architecture:** Save an outbox row with the expense in PostgreSQL. A relay publishes it to Kafka; a dedicated NestJS worker on Railway consumes it and calls Resend.

**Tech stack:** Python 3.13, FastAPI, SQLAlchemy/Alembic, PostgreSQL, aiokafka for the relay, NestJS 11, Node.js 22, KafkaJS, Resend, Next.js, Railway.

**Spec:** [Expense notification server design](../specs/2026-11-05-notification-server-design.md).

## Global constraints

- One shared write path for REST and chat. No Kafka or Resend call in a request or agent tool.
- Up to five recipients, opt-in, closed pilot with a per-account allowlist. No financial details in the email.
- One topic `expense.created.v1`; one DLQ `expense.created.v1.dlq`; one stable group `notification-server-v1` per environment.
- Keep the event ID and Resend payload stable on replay. Stop sending at event age 23 hours.
- Start with one relay replica and one notification replica; run neither as a cron job.

## Review focus

| Failure | Expected behavior |
|---|---|
| Expense insert or outbox insert fails | Both roll back; no email |
| Kafka is down during create | Expense saves; relay retries the committed outbox row |
| Resend accepts before the worker crashes | Replay uses the same key and payload, including after a partial send |
| Invalid Kafka event or one permanently invalid recipient | Redacted DLQ; valid recipients still processed; commit only after DLQ acknowledgement |
| Recipient edit, revoked allowlist, or very old event | New events use current eligible settings; committed snapshots are immutable; expired events never send |

## 1. Add profile storage and settings

- [ ] In `apps/expense-api`, run `uv run alembic heads`. Generate an Alembic revision after current head (observed `c8d4e6f7a1b2`). Add the column now; put the outbox table in a second revision in step 3. Downgrade drops the column.
- [ ] Write tests using `auth_client` in `apps/expense-api/tests/test_auth.py`: existing/new account gets `[]`; missing field preserves saved addresses; `[]` clears them; null, invalid address, and six entries get 422; cross-account allowlist entry gets 422; missing CSRF or admin identity cannot update; admin listings do not return the field. Test migration and defaults on PostgreSQL too.

Migration `upgrade()` addition (PostgreSQL); `downgrade()` drops the check before the column:

```python
op.add_column("users", sa.Column(
    "notification_emails", sa.JSON(), nullable=False, server_default=sa.text("'[]'"),
))
op.create_check_constraint(
    "ck_users_notification_emails",
    "users",
    "CASE WHEN json_typeof(notification_emails) = 'array' "
    "THEN json_array_length(notification_emails) <= 5 ELSE false END",
)
```

Use SQLAlchemy `JSON` (the bounded list is always read/replaced as a whole; the ORM also needs to work in the existing SQLite tests). Add this to `User` in `app/models.py` and import `JSON` and `text` from SQLAlchemy. Keep the PostgreSQL-specific check in Alembic.

```python
notification_emails: Mapped[list[str]] = mapped_column(
    JSON, nullable=False, default=list, server_default=text("'[]'"),
)
```

In `app/auth_schemas.py`, add `notification_emails: list[str]` to `AuthUserResponse`. Add this to `UserProfileUpdate`:

```python
notification_emails: list[EmailStr] = Field(default_factory=list, max_length=5)

@field_validator("notification_emails")
@classmethod
def unique_notification_emails(cls, values: list[EmailStr]) -> list[str]:
    # EmailStr normalizes addresses; preserve the first spelling of the local part.
    result: dict[str, str] = {}
    for value in values:
        address = str(value)
        result.setdefault(address.casefold(), address)
    return list(result.values())
```

In `app/config.py`, import `EmailStr` from Pydantic and `UUID` from `uuid`; add the following. Railway supplies the map as a JSON variable, for example `{"<merchant-uuid>":["pilot@example.com"]}`. Normalize and deduplicate the operator's entries through a helper. Case-fold for matching, then return the operator's canonical spelling.

```python
expense_notifications_enabled: bool = False
notification_recipient_allowlist: dict[UUID, list[EmailStr]] = Field(default_factory=dict)
```

Add `app/notification_recipients.py`:

```python
from collections.abc import Iterable
from uuid import UUID

from app.config import get_settings


def eligible_recipients(user_id: UUID, requested: Iterable[str]) -> list[str]:
    configured = get_settings().notification_recipient_allowlist.get(user_id, [])
    allowed = {str(address).casefold(): str(address) for address in configured}
    keys = dict.fromkeys(address.casefold() for address in requested)
    return [allowed[key] for key in keys if key in allowed]
```

Insert this into `update_user_profile` in `app/auth_services.py` **before** assigning the other fields. Import `eligible_recipients`. Keep the existing profile route, merchant dependency and CSRF check.

```python
if "notification_emails" in data.model_fields_set:
    recipients = eligible_recipients(user.id, data.notification_emails)
    if len(recipients) != len(data.notification_emails):
        raise AuthFailure("RECIPIENT_NOT_ALLOWED", "This address is not approved.", 422)
    user.notification_emails = recipients
```

- [ ] With notifications still disabled, run `uv run alembic upgrade head` against a disposable PostgreSQL database and run `uv run pytest tests/test_auth.py tests/test_admin.py`. Confirm old and new profiles default to off.

## 2. Expose the profile controls

- [ ] In `apps/web/src/lib/auth-types.ts` add `notification_emails: string[]` to `AuthUser` and `notification_emails?: string[]` to `UserProfileUpdate`. Keep the existing auth client and proxy.
- [ ] In `apps/web/src/app/(dashboard)/settings/user/page.tsx`, add `notification_emails: z.string()` to the form schema and initialize with `(user?.notification_emails ?? []).join("\n")`. Add a controlled textarea field labelled “Expense notification emails”; one address per line, empty to turn off future emails. Tell the user to use approved addresses and that already queued emails may still arrive. Use server validation as the authority; show a field error for 422. If the page renders before auth is loaded, mount the form once a user exists or reset from the loaded profile once; avoid resetting on an unrelated rerender while typing.

```tsx
const recipients = data.notification_emails.split(/\r?\n/)
  .map((line) => line.trim()).filter(Boolean);
if (recipients.length > 5) {
  form.setError("notification_emails", { message: "Enter up to five email addresses." });
  return;
}
const updated = await updateProfile({ ...data, notification_emails: recipients });
form.reset({
  name: updated.name,
  monthly_expense_target: updated.monthly_expense_target,
  notification_emails: (updated.notification_emails ?? []).join("\n"),
});
```

- [ ] Update typed auth fixtures and the profile page tests: populated textarea, successful save with list, clear sends `[]`, and 422 leaves form edits available. Regenerate and commit `packages/contracts/src/generated/expense.ts` using `pnpm contracts:generate`. Run `pnpm --filter @expense-tracker/web lint`, `typecheck`, and `test` as separate commands. Deploy the UI only at the final pilot step.

## 3. Save the event with the expense

- [ ] Add `app/notification_event.py` under `apps/expense-api` with this contract. The NestJS consumer validates the same Kafka JSON shape in step 5. Keep the wire contract separate from web OpenAPI.

```python
from datetime import timedelta
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, EmailStr, Field

TOPIC = "expense.created.v1"
DLQ = "expense.created.v1.dlq"
MAX_AGE = timedelta(hours=23)


class ExpenseCreatedV1(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["expense.created.v1"] = TOPIC
    event_id: UUID
    expense_id: UUID
    occurred_at: AwareDatetime
    recipients: list[EmailStr] = Field(min_length=1, max_length=5)
```

- [ ] Add this ORM model to `app/models.py`. In Alembic, create the matching table (use `sa.Uuid()`, `sa.DateTime(timezone=True)`, `sa.JSON()`, and an index on `created_at`). Downgrade drops the table. It is a transient queue; it intentionally has no cascade from expense deletion and stores no expense details.

```python
class ExpenseOutbox(Base):
    __tablename__ = "expense_outbox"

    event_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
```

- [ ] Change only the shared `create_expense` in `app/services.py`. The route and `tools/expenses.py` already call it. Import `ExpenseOutbox`, `get_settings`, `eligible_recipients`, and `ExpenseCreatedV1`. No change to prompts or result payloads.

```python
async def create_expense(
    session: AsyncSession, user_id: uuid.UUID, data: ExpenseCreate
) -> Expense:
    expense = Expense(user_id=user_id, **data.model_dump())
    try:
        session.add(expense)
        await session.flush()
        await session.refresh(expense)  # Fail before commit; load server defaults.
        if get_settings().expense_notifications_enabled:
            addresses = await session.scalar(
                select(User.notification_emails).where(User.id == user_id, User.is_active)
            )
            recipients = eligible_recipients(user_id, addresses or [])
            if recipients:
                event = ExpenseCreatedV1(
                    event_id=uuid.uuid4(),
                    expense_id=expense.id,
                    occurred_at=datetime.now(UTC),
                    recipients=recipients,
                )
                session.add(ExpenseOutbox(
                    event_id=event.event_id,
                    created_at=event.occurred_at,
                    payload=event.model_dump(mode="json"),
                ))
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    return expense
```

The repo uses `expire_on_commit=False`. The profile read and the insert share the same transaction. A concurrent profile edit is observed according to the profile read's snapshot; it never mutates an existing event. An uncertain database commit acknowledgement remains possible; do not automatically retry expense creation.

- [ ] Add integration assertions: one REST create and one agent tool invocation each produce one matching outbox row; different merchant sees only their recipients; empty list, revoked address, disabled flag, edit, delete and failed insert add no event. Inject a real outbox INSERT failure on PostgreSQL and assert both tables are unchanged. Test existing expense response fields, including timestamps. Turn off `echo=True` in `app/database.py` before this reaches production; ensure validation failures and exceptions never log SQL parameters, credentials or event bodies.
- [ ] Run `uv run ruff check .` and `uv run pytest` from `apps/expense-api` with the test database settings. Test migration and rollback in a disposable PostgreSQL database.

## 4. Run the outbox relay

- [ ] From `apps/expense-api`, run `uv add aiokafka` and commit the lockfile. Add `app/kafka_config.py` to the expense API for the relay. Allow plaintext only on explicit development configuration; production must use a managed cluster with TLS and a SCRAM mechanism it supports.

```python
import os
import ssl


def kafka_config() -> dict:
    brokers = os.environ["KAFKA_BOOTSTRAP_SERVERS"]
    if os.getenv("KAFKA_ALLOW_LOCAL_PLAINTEXT") == "true":
        if os.getenv("APP_ENV") not in {"development", "test"}:
            raise RuntimeError("Plaintext Kafka is development-only")
        return {"bootstrap_servers": brokers, "security_protocol": "PLAINTEXT"}
    return {
        "bootstrap_servers": brokers,
        "security_protocol": "SASL_SSL",
        "ssl_context": ssl.create_default_context(),
        "sasl_mechanism": os.getenv("KAFKA_SASL_MECHANISM", "SCRAM-SHA-512"),
        "sasl_plain_username": os.environ["KAFKA_USERNAME"],
        "sasl_plain_password": os.environ["KAFKA_PASSWORD"],
    }
```

- [ ] Add `app/outbox_relay.py` and run it separately with `python -m app.outbox_relay`. A publish deadline limits time holding the row lock; on timeout fail the worker and restart from PostgreSQL. The broker may have received the message despite a timeout. A database failure after broker acknowledgement can also produce a duplicate; both cases preserve the same event ID.

```python
import asyncio
import json
import logging
import signal

from aiokafka import AIOKafkaProducer
from sqlalchemy import select

from app.database import SessionLocal, engine
from app.kafka_config import kafka_config
from app.models import ExpenseOutbox
from app.notification_event import TOPIC

log = logging.getLogger(__name__)


async def relay_once(producer: AIOKafkaProducer) -> bool:
    async with SessionLocal.begin() as session:
        row = await session.scalar(
            select(ExpenseOutbox)
            .order_by(ExpenseOutbox.created_at, ExpenseOutbox.event_id)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if row is None:
            return False
        event_id = row.event_id
        await asyncio.wait_for(
            producer.send_and_wait(
                TOPIC,
                key=str(event_id).encode(),
                value=json.dumps(row.payload, separators=(",", ":")).encode(),
            ),
            timeout=10,
        )
        await session.delete(row)
    log.info("outbox_published event_id=%s", event_id)
    return True


async def main() -> None:
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    loop.add_signal_handler(signal.SIGTERM, stop.set)
    loop.add_signal_handler(signal.SIGINT, stop.set)
    producer = AIOKafkaProducer(**kafka_config(), acks="all", request_timeout_ms=5000)
    try:
        await asyncio.wait_for(producer.start(), 10)
        while not stop.is_set():
            if not await relay_once(producer):
                try:
                    await asyncio.wait_for(stop.wait(), 1)
                except TimeoutError:
                    pass
    finally:
        try:
            await asyncio.wait_for(producer.stop(), 10)
        finally:
            await engine.dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    try:
        asyncio.run(main())
    except Exception as exc:
        log.error("relay_failed error_type=%s", type(exc).__name__)
        raise SystemExit(1) from None
```

- [ ] Test against PostgreSQL: fake producer failure leaves row pending; acknowledgement deletes it; database commit failure after acknowledgement keeps the row and the second publish uses the same key and payload. In staging, disable Kafka access, create an expense, check the backlog, restore access, and verify drain. When polling returns no row, no Kafka send is attempted.

## 5. Build the dedicated NestJS notification service

- [ ] Create `apps/notification-server/package.json` with name `@expense-tracker/notification-server`, `"private": true`, `"files": ["dist"]` and scripts `"build": "tsc -p tsconfig.json"`, `"typecheck": "tsc -p tsconfig.json --noEmit"`, and `"start": "node dist/main.js"`. The existing pnpm workspace includes `apps/*`. From the repo root, install dependencies and commit the shared lockfile.

```bash
pnpm --filter @expense-tracker/notification-server add @nestjs/common@^11 @nestjs/core@^11 reflect-metadata rxjs kafkajs zod@^4
pnpm --filter @expense-tracker/notification-server add -D typescript@^5.9 @types/node@^22
```

- [ ] Create `apps/notification-server/tsconfig.json`.

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "commonjs",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] Create `src/expense-created.ts` in the new app. The Kafka value is the UTF-8 JSON output from the Python producer in step 3. Keep a producer-generated JSON fixture and validate it in a Node test to catch contract drift, including timestamp format and email validation.

```ts
import { z } from "zod";

export const TOPIC = "expense.created.v1";
export const DLQ = "expense.created.v1.dlq";
export const MAX_AGE_MS = 23 * 60 * 60 * 1000;
export const expenseCreated = z.strictObject({
  type: z.literal(TOPIC),
  event_id: z.uuid(),
  expense_id: z.uuid(),
  occurred_at: z.iso.datetime({ offset: true }),
  recipients: z.array(z.email({ pattern: z.regexes.unicodeEmail })).min(1).max(5),
});
export type ExpenseCreated = z.infer<typeof expenseCreated>;

export function parseEvent(value: Buffer | null): ExpenseCreated | undefined {
  if (value === null) return;
  try {
    const result = expenseCreated.safeParse(JSON.parse(value.toString("utf8")));
    if (result.success) return result.data;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
}
```

- [ ] Create `src/config.ts`. Use the Railway environment as the configuration source. The worker accepts the same SCRAM credentials and explicit local plaintext settings as the Python relay.

```ts
import type { KafkaConfig } from "kafkajs";

export function required(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing ${name}`);
  return value;
}

export function kafkaConfig(): KafkaConfig {
  const brokers = required("KAFKA_BOOTSTRAP_SERVERS").split(",").map((value) => value.trim());
  if (brokers.some((broker) => !broker)) throw new Error("Invalid Kafka broker list");
  const config: KafkaConfig = {
    clientId: "notification-server",
    brokers,
    connectionTimeout: 8_000,
    requestTimeout: 8_000,
    retry: { retries: 2, restartOnFailure: async () => false },
  };
  if (process.env.KAFKA_ALLOW_LOCAL_PLAINTEXT === "true") {
    if (!["development", "test"].includes(process.env.APP_ENV ?? "")) {
      throw new Error("Plaintext Kafka is development-only");
    }
    return config;
  }
  const mechanism = (process.env.KAFKA_SASL_MECHANISM ?? "SCRAM-SHA-512").toLowerCase();
  if (mechanism !== "scram-sha-256" && mechanism !== "scram-sha-512") {
    throw new Error("Unsupported Kafka SCRAM mechanism");
  }
  const credentials = { username: required("KAFKA_USERNAME"), password: required("KAFKA_PASSWORD") };
  if (mechanism === "scram-sha-256") {
    return { ...config, ssl: true, sasl: { mechanism, ...credentials } };
  }
  return { ...config, ssl: true, sasl: { mechanism, ...credentials } };
}
```

- [ ] Create `src/resend.service.ts`. Keep the sender and message body stable while v1 events can be replayed. An accepted response includes a provider ID. A timeout can still mean Resend accepted the request.

```ts
import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { required } from "./config";
import { ExpenseCreated, MAX_AGE_MS } from "./expense-created";

type Outcome = { acceptedId: string } | { reason: string };

@Injectable()
export class ResendService {
  private readonly sender = required("RESEND_FROM");
  private readonly token = required("RESEND_API_KEY");

  async send(
    event: ExpenseCreated,
    address: string,
    heartbeat: () => Promise<void>,
    signal: AbortSignal,
  ): Promise<Outcome> {
    const digest = createHash("sha256").update(address).digest("hex");
    const key = `expense-created-v1/${event.event_id}/${digest}`;
    const body = JSON.stringify({
      from: this.sender,
      to: [address],
      subject: "A new expense was added",
      text: "A new expense was added to your expense tracker.",
    });
    for (let attempt = 0; attempt < 4; attempt++) {
      signal.throwIfAborted();
      if (Date.now() - Date.parse(event.occurred_at) >= MAX_AGE_MS) {
        return { reason: "expired" };
      }

      let delay = 1000 * 2 ** attempt;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body,
        signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
      }).catch(() => undefined);
      signal.throwIfAborted();

      if (response?.ok) {
        const data = await response.json().catch(() => null);
        if (typeof data?.id === "string" && data.id) return { acceptedId: data.id };
      } else if (response) {
        const status = response.status;
        const retryAfter = response.headers.get("retry-after") ?? "";
        const error = await response.json().catch(() => null);
        if (status === 401 || status === 403) throw new Error("Resend configuration rejected");
        if (status === 429 && /^\d{1,6}$/.test(retryAfter)) {
          delay = Math.max(delay, Number(retryAfter) * 1000);
        }
        if (status < 500 && status !== 429
          && !(status === 409 && error?.name === "concurrent_idempotent_requests")) {
          return { reason: `resend_${status}` };
        }
      }

      if (attempt === 3 || delay > 15_000) return { reason: "retry_exhausted" };
      await heartbeat();
      await sleep(delay, undefined, { signal });
      await heartbeat();
    }
    throw new Error("Unreachable retry state");
  }
}
```

- [ ] Create `src/notification-worker.service.ts`. Use KafkaJS directly inside a Nest provider so the application controls offset commits, heartbeats and DLQ acknowledgement. Keep partition processing sequential. Use `BigInt` for Kafka offsets. A failed DLQ publish or commit leaves the record eligible for replay. The worker may emit a duplicate DLQ record, identified by the same source coordinate and recipient index.

```ts
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { EachMessagePayload, Kafka, logLevel } from "kafkajs";
import { kafkaConfig } from "./config";
import { DLQ, parseEvent, TOPIC } from "./expense-created";
import { ResendService } from "./resend.service";

@Injectable()
export class NotificationWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(NotificationWorker.name);
  private readonly stop = new AbortController();
  private readonly kafka = new Kafka({ ...kafkaConfig(), logLevel: logLevel.NOTHING });
  private readonly producer = this.kafka.producer({ allowAutoTopicCreation: false });
  private readonly consumer = this.kafka.consumer({
    groupId: "notification-server-v1",
    allowAutoTopicCreation: false,
    sessionTimeout: 60_000,
    heartbeatInterval: 3_000,
  });

  constructor(private readonly resend: ResendService) {}

  async onApplicationBootstrap(): Promise<void> {
    this.consumer.on(this.consumer.events.CRASH, () => {
      if (this.stop.signal.aborted) return;
      this.log.error("Kafka consumer crashed");
      process.exit(1);
    });
    await this.producer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: [TOPIC], fromBeginning: true });
    await this.consumer.run({
      autoCommit: false,
      eachMessage: async (record) => {
        try {
          this.stop.signal.throwIfAborted();
          await this.handle(record);
          this.stop.signal.throwIfAborted();
          await record.heartbeat();
          await this.consumer.commitOffsets([{
            topic: record.topic,
            partition: record.partition,
            offset: (BigInt(record.message.offset) + 1n).toString(),
          }]);
        } catch (error) {
          if (!this.stop.signal.aborted) throw error;
        }
      },
    });
  }

  private async handle(record: EachMessagePayload): Promise<void> {
    const event = parseEvent(record.message.value);
    if (!event) return this.deadLetter(record, "invalid_event");
    if (Date.parse(event.occurred_at) > Date.now() + 120_000) {
      return this.deadLetter(record, "invalid_event_time", event.event_id);
    }
    for (const [index, address] of event.recipients.entries()) {
      await record.heartbeat();
      const result = await this.resend.send(event, address, record.heartbeat, this.stop.signal);
      if ("acceptedId" in result) {
        this.log.log(`resend_accepted event_id=${event.event_id} resend_id=${result.acceptedId}`);
      } else {
        await record.heartbeat();
        await this.deadLetter(record, result.reason, event.event_id, index);
      }
    }
  }

  private async deadLetter(
    record: EachMessagePayload,
    reason: string,
    eventId?: string,
    index?: number,
  ): Promise<void> {
    const { topic, partition, message } = record;
    const source = `${topic}:${partition}:${message.offset}`;
    await this.producer.send({
      topic: DLQ,
      acks: -1,
      messages: [{
        key: `${source}:${index ?? "event"}`,
        value: JSON.stringify({
          source_topic: topic,
          source_partition: partition,
          source_offset: message.offset,
          event_id: eventId ?? null,
          recipient_index: index ?? null,
          reason,
        }),
      }],
    });
    this.log.warn(`notification_dlq source=${source} reason=${reason}`);
  }

  async onModuleDestroy(): Promise<void> {
    this.stop.abort();
    try {
      await this.consumer.disconnect();
    } finally {
      await this.producer.disconnect();
    }
  }
}
```

- [ ] Create `src/main.ts` with the standalone Nest application context. This starts the consumer through Nest lifecycle hooks and binds no HTTP port.

```ts
import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NotificationWorker } from "./notification-worker.service";
import { ResendService } from "./resend.service";

@Module({ providers: [NotificationWorker, ResendService] })
class NotificationModule {}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(NotificationModule, {
    abortOnError: false,
    logger: false,
  });
  app.useLogger(new Logger("notification-server"));
  app.enableShutdownHooks(["SIGTERM", "SIGINT"]);
  new Logger("notification-server").log("Notification consumer started");
}

void bootstrap().catch(() => {
  new Logger("notification-server").error("Startup failed. Check broker access and required variables.");
  process.exit(1);
});
```

- [ ] Test the cross-language fixture, malformed JSON and tombstones, timeout followed by acceptance with the same key and body, concurrent 409 retry, 429 exhaustion, late events, and one accepted plus one permanently rejected recipient. Test offsets against disposable Kafka. Verify that Resend authentication failure, DLQ publication failure, and shutdown during a send leave the current offset uncommitted. Replay after acceptance but before the offset commit and confirm the mock provider accepts only one send per key. Run `pnpm --filter @expense-tracker/notification-server typecheck` and `pnpm --filter @expense-tracker/notification-server build`.

- [ ] Add `apps/notification-server/Dockerfile` using the repo root as build context. The runtime stage gets the built package and its production dependencies.

```dockerfile
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/notification-server/package.json apps/notification-server/package.json
RUN pnpm install --frozen-lockfile --filter @expense-tracker/notification-server...
COPY apps/notification-server/tsconfig.json apps/notification-server/tsconfig.json
COPY apps/notification-server/src apps/notification-server/src
RUN pnpm --filter @expense-tracker/notification-server build \
    && pnpm --filter @expense-tracker/notification-server deploy --prod /out

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
CMD ["node", "dist/main.js"]
```

## 6. Exercise the full flow locally

- [ ] Use the existing Compose PostgreSQL service and a Kafka-compatible broker. For a quick disposable dev broker, follow the [Redpanda Docker quickstart](https://docs.redpanda.com/streaming/25.1/get-started/quick-start/); connect host processes to the external advertised address (the example uses `localhost:19092`). In that Compose project, provision topics:

```bash
docker compose exec redpanda-0 rpk topic create expense.created.v1 -p 1 -r 1
docker compose exec redpanda-0 rpk topic create expense.created.v1.dlq -p 1 -r 1
```

- [ ] For each local process that talks to Kafka, set `APP_ENV=development`, `KAFKA_ALLOW_LOCAL_PLAINTEXT=true`, and `KAFKA_BOOTSTRAP_SERVERS=localhost:19092`. Set a local expense `DATABASE_URL` for API and relay (Compose publishes port 5433). Run `uv run alembic upgrade head` in `apps/expense-api`; start the API as usual and run the relay in a second terminal with `uv run python -m app.outbox_relay`. Set the Resend variables for the NestJS worker. From the repo root run `pnpm --filter @expense-tracker/notification-server build` followed by `pnpm --filter @expense-tracker/notification-server start`. Keep Resend keys out of the repo and shell history; inject them from a local secret store or ignored environment file. The standalone worker reads actual process environment.
- [ ] Enable capture and configure your test merchant and approved inboxes. Save profile, create through both REST and chat, compare each expense and worker acceptance, then check the inbox and Resend status. Change the profile and confirm the next expense uses the new list. Repeat with no recipients. Do not use real users or production addresses in test fixtures.
- [ ] Add `apps/expense-api/Dockerfile.dockerignore` before building: the existing image copies the entire API directory. Use these repo-relative patterns so local secrets and a host-built virtual environment cannot overwrite the container files:

  ```dockerignore
  **/.env
  **/.env.*
  **/.venv
  **/__pycache__
  **/.pytest_cache
  **/.ruff_cache
  .git
  ```

- [ ] From the repo root build both images: `docker build -f apps/expense-api/Dockerfile -t expense-api:notifications .` and `docker build -f apps/notification-server/Dockerfile -t notification-server:local .`. Verify the relay command and worker start in their containers using broker addresses reachable from those containers (not host localhost).

## 7. Deploy on Railway and operate the pilot

1. **Provision dependencies first.** Verify a Resend sender subdomain and DNS, and create a sending key restricted to that domain where available. Provision separate staging and production Kafka environments. For production, target three replicas per topic and `min.insync.replicas=2` where the provider exposes those settings; use one partition to start, no topic autocreation, and `cleanup.policy=delete`. Set source retention to 48 hours and DLQ retention to 7 days; configure a short segment roll (e.g. one hour) so low volume doesn't keep PII around indefinitely. Kafka retention is asynchronous. Provision a relay credential with source-topic write and a worker credential with source read, group access, and DLQ write (include needed metadata/describe permissions). Use a separate operator credential for investigations. Verify outbound broker reachability for all advertised brokers from the Railway region.
2. **Deploy schema and API with capture off.** Keep the existing API's Dockerfile build. Set its pre-deploy command to `alembic upgrade head` and keep migrations owned by this one service. Add `EXPENSE_NOTIFICATIONS_ENABLED=false`, the JSON allowlist, and `PUBLIC_REGISTRATION=false` for the closed pilot. Restrict the pilot to trusted accounts; disabling registration doesn't disable existing accounts. Use separate staging/production databases, normal production auth settings, and private PostgreSQL references.
3. **Deploy workers from the same Git revision.** Keep Railway source root at repo root for both images. Use these service settings:

   | Railway service | Dockerfile path | Start command | Variables |
   |---|---|---|---|
   | `expense-outbox-relay` | `apps/expense-api/Dockerfile` | `python -m app.outbox_relay` | Expense DB `DATABASE_URL` reference; Kafka relay credentials |
   | `notification-server` | `apps/notification-server/Dockerfile` | Docker CMD | Kafka worker credentials; `RESEND_API_KEY`, `RESEND_FROM` |

   Set each Dockerfile path via `RAILWAY_DOCKERFILE_PATH`. Both services need `APP_ENV=production`, `KAFKA_BOOTSTRAP_SERVERS` (comma-separated host:port), `KAFKA_USERNAME`, `KAFKA_PASSWORD`, and the provider's `KAFKA_SASL_MECHANISM`. Neither worker needs a public domain, HTTP healthcheck, volume, or scheduled execution. Keep serverless sleeping off. Set restart on failure with retries and alert if retries are exhausted. Set `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=60`; interrupted sends replay using the same idempotency keys. Run one replica of each to start. The notification worker must not get `DATABASE_URL`, LLM keys, or API auth secrets.
4. **Canary.** Deploy web after API and confirm the profile round-trip. Turn capture on for staging and then for the closed production pilot, with only one account opted in initially. Create one expense and verify outbox drain, consumer offset advance, Resend acceptance, and test inbox receipt. Run the failure scenarios in staging before adding more recipients.
5. **Monitor.** Alert on oldest pending outbox row above 5 minutes, source consumer lag age above 5 minutes, any DLQ message, repeated process exits, or Resend authentication/domain failure. For the relay DB check, query `SELECT count(*), min(created_at) FROM expense_outbox;` through existing DB monitoring. Check email delivery and bounces in Resend. Inspect logs using event IDs and provider IDs; avoid enabling payload/SQL tracing.
6. **Rollback and recovery.** Disable capture to stop creating new events; stop the notification worker as well if queued sends must pause. Keep the migration and existing Kafka offsets. Restart after fixing the failure, then watch backlog age and DLQ. For a DLQ entry, inspect the source partition/offset with restricted tooling while still retained; check Resend before considering replay. Only replay the original bytes with the same event ID and unchanged sender within the 23-hour window. Never reset the whole consumer group in production for one bad record. For expired or uncertain sends outside the window, investigate manually; there is no safe automatic resend guarantee.
7. **Document what shipped.** Update `ARCHITECTURE.md` for service ownership and Kafka flow, `docs/PRODUCT_SPEC.md` for opt-in/snapshot behavior, `docs/AGENT_CONTRACTS.md` to clarify the tool reports only expense persistence, and `docs/IMPLEMENTATION_PLAN.md` with the new milestone. Public enablement needs verified recipient consent, rate limits and bounce/suppression handling.

Provider references: [Resend send endpoint](https://resend.com/docs/api-reference/emails/send-email), [Resend idempotency keys](https://resend.com/changelog/idempotency-keys), [NestJS standalone apps](https://docs.nestjs.com/standalone-applications), [KafkaJS consumer and manual offsets](https://kafka.js.org/docs/consuming), [Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles), [Railway pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command), [Railway variables and drain time](https://docs.railway.com/variables/reference).
