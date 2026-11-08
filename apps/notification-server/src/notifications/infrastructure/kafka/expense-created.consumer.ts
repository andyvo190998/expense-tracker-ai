import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { EachMessagePayload, Kafka, logLevel } from 'kafkajs';
import { kafkaConfig } from '../config.js';
import { NotifyExpenseCreated } from '../../application/notify-expense-created.js';
import { DLQ, parseEvent, TOPIC } from './expense-created.v1.js';

@Injectable()
export class ExpenseCreatedConsumer
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly log = new Logger(ExpenseCreatedConsumer.name);
  private readonly stop = new AbortController();
  private readonly kafka = new Kafka({
    ...kafkaConfig(),
    logLevel: logLevel.NOTHING,
  });
  private readonly producer = this.kafka.producer({
    allowAutoTopicCreation: false,
  });
  private readonly consumer = this.kafka.consumer({
    groupId: 'notification-server-v1',
    allowAutoTopicCreation: false,
    sessionTimeout: 60000,
    heartbeatInterval: 3000,
  });

  constructor(private readonly notify: NotifyExpenseCreated) {}

  async onApplicationBootstrap(): Promise<void> {
    this.consumer.on(this.consumer.events.CRASH, ({ payload }) => {
      if (this.stop.signal.aborted) return;
      this.log.error(
        'kafka consumer crashed, exiting process',
        payload.error.stack ?? payload.error.message,
      );
      process.exit(1);
    });

    await this.producer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: TOPIC, fromBeginning: true });
    await this.consumer.run({
      autoCommit: false,
      eachMessage: async (record) => {
        try {
          this.stop.signal.throwIfAborted();
          await this.handle(record);
          this.stop.signal.throwIfAborted();
          await record.heartbeat();
          await this.consumer.commitOffsets([
            {
              topic: record.topic,
              partition: record.partition,
              offset: (BigInt(record.message.offset) + 1n).toString(),
            },
          ]);
        } catch (error) {
          if (!this.stop.signal.aborted) {
            throw error;
          }
        }
      },
    });
  }

  private async handle(record: EachMessagePayload): Promise<void> {
    const event = parseEvent(record.message.value);
    if (!event) {
      return this.deadLetter(record, 'invalid event');
    }
    if (Date.parse(event.occurred_at) > Date.now() + 120_000) {
      return this.deadLetter(record, 'invalid_event_time', event.event_id);
    }
    const outcomes = await this.notify.execute(
      {
        eventId: event.event_id,
        occurredAt: new Date(event.occurred_at),
        recipients: event.recipients,
        emailSummary: event.email_summary,
      },
      {
        signal: this.stop.signal,
        checkpoint: () => record.heartbeat(),
      },
    );
    for (const [index, result] of outcomes.entries()) {
      if ('acceptId' in result) {
        this.log.log(
          `email_accepted provider=brevo event_id=${event.event_id} transport=smtp message_id=${result.acceptId}`,
        );
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
    const source = `${topic}[${partition}]/${message.offset}`;
    await this.producer.send({
      topic: DLQ,
      acks: -1,
      messages: [
        {
          key: `${source}:${index ?? 'event'}`,
          value: JSON.stringify({
            source_topic: topic,
            source_partition: partition,
            source_offset: message.offset,
            event_id: eventId ?? null,
            reason,
          }),
        },
      ],
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
