# NestJS notification server with DDD

These files fit the existing NestJS 12, ESM and Vitest scaffold. Paths below are relative to `apps/notification-server`. The expense API and relay still publish the [existing Kafka contract](2026-11-05-notification-server.md#3-save-the-event-with-the-expense).

## 1. Install dependencies

From the repository root:

```bash
pnpm --filter notification-server add kafkajs zod@^4
```

Use Node 24 for local and Railway runs. Keep the scaffold's `.js` extensions in relative TypeScript imports.

## 2. Implement the domain and use case

The notification bounded context receives a recipient snapshot from the expense service. The domain defines the deadline and the application chooses the email and sends it through a port. No persistent aggregate is needed.

### `src/notifications/domain/expense-notification.ts`

```ts
export type ExpenseNotification = Readonly<{
  eventId: string;
  occurredAt: Date;
  recipients: readonly string[];
}>;

export function sendDeadline(notification: ExpenseNotification): number {
  return notification.occurredAt.getTime() + 23 * 60 * 60 * 1000;
}
```

### `src/notifications/application/email-sender.ts`

```ts
export type EmailRequest = {
  eventId: string;
  recipient: string;
  subject: string;
  text: string;
  deadlineMs: number;
};

export type DeliveryContext = {
  signal: AbortSignal;
  checkpoint: () => Promise<void>;
};

export type DeliveryOutcome = { acceptedId: string } | { reason: string };

export interface EmailSender {
  send(email: EmailRequest, context: DeliveryContext): Promise<DeliveryOutcome>;
}
```

### `src/notifications/application/notify-expense-created.ts`

```ts
import { sendDeadline } from "../domain/expense-notification.js";
import type { ExpenseNotification } from "../domain/expense-notification.js";
import type { DeliveryContext, DeliveryOutcome, EmailSender } from "./email-sender.js";

export class NotifyExpenseCreated {
  constructor(
    private readonly sender: EmailSender,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(
    notification: ExpenseNotification,
    context: DeliveryContext,
  ): Promise<DeliveryOutcome[]> {
    const deadlineMs = sendDeadline(notification);
    const outcomes: DeliveryOutcome[] = [];
    for (const recipient of notification.recipients) {
      context.signal.throwIfAborted();
      if (this.now() >= deadlineMs) {
        outcomes.push({ reason: "expired" });
        continue;
      }
      await context.checkpoint();
      outcomes.push(await this.sender.send({
        eventId: notification.eventId,
        recipient,
        subject: "A new expense was added",
        text: "A new expense was added to your expense tracker.",
        deadlineMs,
      }, context));
    }
    return outcomes;
  }
}
```

## 3. Implement the Kafka and Resend adapters

Kafka owns offset commits and the DLQ. Resend owns HTTP retry and idempotency. The checkpoint keeps the consumer alive during the use case without importing Kafka into it.

### `src/notifications/infrastructure/kafka/expense-created.v1.ts`

```ts
import { z } from "zod";

export const TOPIC = "expense.created.v1";
export const DLQ = "expense.created.v1.dlq";
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

### `src/notifications/infrastructure/config.ts`

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

### `src/notifications/infrastructure/resend/resend-email.sender.ts`

```ts
import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { required } from "../config.js";
import type { DeliveryContext, DeliveryOutcome, EmailRequest, EmailSender } from "../../application/email-sender.js";

@Injectable()
export class ResendEmailSender implements EmailSender {
  private readonly sender = required("RESEND_FROM");
  private readonly token = required("RESEND_API_KEY");

  async send(
    email: EmailRequest,
    { signal, checkpoint }: DeliveryContext,
  ): Promise<DeliveryOutcome> {
    const digest = createHash("sha256").update(email.recipient).digest("hex");
    const key = `expense-created-v1/${email.eventId}/${digest}`;
    const body = JSON.stringify({
      from: this.sender,
      to: [email.recipient],
      subject: email.subject,
      text: email.text,
    });
    for (let attempt = 0; attempt < 4; attempt++) {
      signal.throwIfAborted();
      if (Date.now() >= email.deadlineMs) {
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
      await checkpoint();
      await sleep(delay, undefined, { signal });
      await checkpoint();
    }
    throw new Error("Unreachable retry state");
  }
}
```

### `src/notifications/infrastructure/kafka/expense-created.consumer.ts`

```ts
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { Kafka, logLevel } from "kafkajs";
import type { EachMessagePayload } from "kafkajs";
import { kafkaConfig } from "../config.js";
import { DLQ, parseEvent, TOPIC } from "./expense-created.v1.js";
import { NotifyExpenseCreated } from "../../application/notify-expense-created.js";

@Injectable()
export class ExpenseCreatedConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(ExpenseCreatedConsumer.name);
  private readonly stop = new AbortController();
  private readonly kafka = new Kafka({ ...kafkaConfig(), logLevel: logLevel.NOTHING });
  private readonly producer = this.kafka.producer({ allowAutoTopicCreation: false });
  private readonly consumer = this.kafka.consumer({
    groupId: "notification-server-v1",
    allowAutoTopicCreation: false,
    sessionTimeout: 60_000,
    heartbeatInterval: 3_000,
  });

  constructor(private readonly notify: NotifyExpenseCreated) {}

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
    const outcomes = await this.notify.execute({
      eventId: event.event_id,
      occurredAt: new Date(event.occurred_at),
      recipients: event.recipients,
    }, {
      signal: this.stop.signal,
      checkpoint: record.heartbeat,
    });
    for (const [index, result] of outcomes.entries()) {
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

## 4. Wire the module into the scaffold

### `src/notifications/notifications.module.ts`

```ts
import { Module } from "@nestjs/common";
import { NotifyExpenseCreated } from "./application/notify-expense-created.js";
import { ExpenseCreatedConsumer } from "./infrastructure/kafka/expense-created.consumer.js";
import { ResendEmailSender } from "./infrastructure/resend/resend-email.sender.js";

@Module({
  providers: [
    ResendEmailSender,
    {
      provide: NotifyExpenseCreated,
      inject: [ResendEmailSender],
      useFactory: (sender: ResendEmailSender) => new NotifyExpenseCreated(sender),
    },
    ExpenseCreatedConsumer,
  ],
})
export class NotificationsModule {}
```

In `src/app.module.ts`, add this import and append `NotificationsModule` to the existing `imports` array. Keep the Observe configuration and scaffold controller. Stub both infrastructure providers in the scaffold's HTTP e2e spec.

```ts
import { NotificationsModule } from "./notifications/notifications.module.js";
```

### `src/main.ts`

```ts
import { NestFactory } from "@nestjs/core";
import { AppModule, ObserveInstrument } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  app.enableShutdownHooks(["SIGTERM", "SIGINT"]);
  await app.listen(Number(process.env.PORT ?? 3000), "0.0.0.0");
}

await bootstrap();
```

### Update `test/app.e2e-spec.ts`

Add these imports, then use the provider overrides in the existing `beforeEach`:

```ts
import { ExpenseCreatedConsumer } from "../src/notifications/infrastructure/kafka/expense-created.consumer.js";
import { ResendEmailSender } from "../src/notifications/infrastructure/resend/resend-email.sender.js";

const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(ExpenseCreatedConsumer)
  .useValue({})
  .overrideProvider(ResendEmailSender)
  .useValue({})
  .compile();
```

## 5. Test without Kafka or Resend

### `src/notifications/application/notify-expense-created.spec.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import type { EmailSender } from "./email-sender.js";
import { NotifyExpenseCreated } from "./notify-expense-created.js";

const now = Date.UTC(2026, 10, 6);
const notification = {
  eventId: "11111111-1111-4111-8111-111111111111",
  occurredAt: new Date(now),
  recipients: ["first@example.com", "second@example.com"],
};
const context = {
  signal: new AbortController().signal,
  checkpoint: async () => {},
};

describe("NotifyExpenseCreated", () => {
  it("sends to the second recipient when the first is rejected", async () => {
    const send = vi.fn<EmailSender["send"]>()
      .mockResolvedValueOnce({ reason: "resend_422" })
      .mockResolvedValueOnce({ acceptedId: "email-2" });
    const useCase = new NotifyExpenseCreated({ send }, () => now);

    expect(await useCase.execute(notification, context)).toEqual([
      { reason: "resend_422" },
      { acceptedId: "email-2" },
    ]);
    expect(send.mock.calls.map(([email]) => email.recipient)).toEqual(notification.recipients);
  });

  it("skips a notification at the replay deadline", async () => {
    const send = vi.fn<EmailSender["send"]>();
    const useCase = new NotifyExpenseCreated({ send }, () => now + 23 * 60 * 60 * 1000);

    expect(await useCase.execute(notification, context)).toEqual([
      { reason: "expired" },
      { reason: "expired" },
    ]);
    expect(send).not.toHaveBeenCalled();
  });
});
```

### `src/notifications/infrastructure/kafka/expense-created.v1.spec.ts`

```ts
import { expect, it } from "vitest";
import { parseEvent, TOPIC } from "./expense-created.v1.js";

it("validates the expense-created v1 wire shape", () => {
  const event = {
    type: TOPIC,
    event_id: "11111111-1111-4111-8111-111111111111",
    expense_id: "22222222-2222-4222-8222-222222222222",
    occurred_at: "2026-11-06T08:10:00.123456Z",
    recipients: ["pilot@example.com"],
  };
  expect(parseEvent(Buffer.from(JSON.stringify(event)))).toEqual(event);
  expect(parseEvent(Buffer.from("{"))).toBeUndefined();
  expect(parseEvent(null)).toBeUndefined();
});
```

### `src/notifications/infrastructure/resend/resend-email.sender.spec.ts`

```ts
import { afterEach, expect, it, vi } from "vitest";
import { ResendEmailSender } from "./resend-email.sender.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("retries an ambiguous timeout with the same key and request body", async () => {
  vi.stubEnv("RESEND_FROM", "notifications@example.com");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  const fetchMock = vi.fn<typeof fetch>()
    .mockRejectedValueOnce(new Error("simulated timeout"))
    .mockResolvedValueOnce(Response.json({ id: "resend-test-id" }));
  vi.stubGlobal("fetch", fetchMock);

  const sender = new ResendEmailSender();
  const outcome = await sender.send({
    eventId: "11111111-1111-4111-8111-111111111111",
    recipient: "pilot@example.com",
    subject: "A new expense was added",
    text: "A new expense was added to your expense tracker.",
    deadlineMs: Date.now() + 60_000,
  }, {
    signal: new AbortController().signal,
    checkpoint: async () => {},
  });

  expect(outcome).toEqual({ acceptedId: "resend-test-id" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const [first, second] = fetchMock.mock.calls.map(([, options]) => options);
  expect(new Headers(first?.headers).get("Idempotency-Key")).toMatch(/^expense-created-v1\//);
  expect(new Headers(second?.headers).get("Idempotency-Key"))
    .toBe(new Headers(first?.headers).get("Idempotency-Key"));
  expect(second?.body).toBe(first?.body);
});
```

Run from the repository root:

```bash
pnpm --filter notification-server test
pnpm --filter notification-server lint
pnpm --filter notification-server build
```

## 6. Send a test event locally

Start the local broker from the [broker setup](2026-11-05-notification-server.md#6-exercise-the-full-flow-locally). Create `expense.created.v1` and `expense.created.v1.dlq` once. Export `RESEND_API_KEY`, `RESEND_FROM` and `TEST_NOTIFICATION_TO` with your verified sender and approved test inbox. Export the Observe variables if using Observe. Then run:

```bash
APP_ENV=development KAFKA_ALLOW_LOCAL_PLAINTEXT=true KAFKA_BOOTSTRAP_SERVERS=localhost:19092 pnpm --filter notification-server start:dev
```

In another terminal, with `TEST_NOTIFICATION_TO` exported and from the broker Compose directory:

```bash
node --input-type=module <<'JS' | docker compose exec -T redpanda-0 rpk topic produce expense.created.v1
import { randomUUID } from 'node:crypto';
const address = process.env.TEST_NOTIFICATION_TO;
if (!address) throw new Error('Set TEST_NOTIFICATION_TO to an inbox you control');
console.log(JSON.stringify({
  type: 'expense.created.v1',
  event_id: randomUUID(),
  expense_id: randomUUID(),
  occurred_at: new Date().toISOString(),
  recipients: [address],
}));
JS
```

Look for `resend_accepted` and verify the inbox. Publish malformed JSON and confirm a redacted DLQ entry. For replay testing, publish the exact same valid event twice and verify both acceptances report the same Resend ID. In staging, test the crash between Resend acceptance and offset commit and test a failing DLQ write before connecting the Python relay.

## 7. Package for Railway

Use this Dockerfile from the repository root. Add `"files": ["dist"]` to the existing worker package manifest so pnpm deploy copies the built output. Commit the root lockfile. Set the worker's `RAILWAY_DOCKERFILE_PATH=apps/notification-server/Dockerfile`, its Kafka and Resend variables, and optional Observe variables. Start with one replica and keep it running continuously.

### `Dockerfile`

```dockerfile
FROM node:24-alpine AS build
WORKDIR /repo
RUN npm install --global pnpm@9.12.3
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/notification-server/package.json apps/notification-server/package.json
RUN pnpm install --frozen-lockfile --filter notification-server...
COPY apps/notification-server/nest-cli.json apps/notification-server/tsconfig*.json apps/notification-server/
COPY apps/notification-server/src apps/notification-server/src
RUN pnpm --filter notification-server build     && pnpm --filter notification-server deploy --prod /out

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
CMD ["node", "dist/main.js"]
```
