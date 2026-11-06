import { Injectable } from '@nestjs/common';
import { required } from '../config.js';
import {
  DeliveryContext,
  DeliveryOutcome,
  EmailRequest,
} from '../../application/email-sender.js';
import { createHash } from 'crypto';
import { setTimeout as sleep } from 'node:timers/promises';

@Injectable()
export class ResendEmailSender {
  private readonly sender = required('RESEND_FROM');
  private readonly token = required('RESEND_API_KEY');

  async send(
    email: EmailRequest,
    { signal, checkpoint }: DeliveryContext,
  ): Promise<DeliveryOutcome> {
    const digest = createHash('sha256').update(email.recipients).digest('hex');
    const key = `expense-created-v1/${email.eventId}/${digest}`;
    const body = JSON.stringify({
      from: this.sender,
      to: [email.recipients],
      subject: email.subject,
      text: email.text,
    });

    for (let attempt = 0; attempt < 4; attempt++) {
      signal.throwIfAborted();
      if (Date.now() >= email.deadline) {
        return { reason: 'expired' };
      }

      let delay = 1000 * 2 ** attempt;

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body,
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      }).catch(() => undefined);
      signal.throwIfAborted();

      if (response?.ok) {
        const data = await response.json().catch(() => null);
        if (typeof data?.id === 'string' && data.id)
          return { acceptId: data.id };
      } else if (response) {
        const status = response.status;
        const retryAfter = response.headers.get('Retry-After') ?? '';
        const error = await response.json().catch(() => null);

        if (status === 401 || status === 403)
          throw new Error('Resend API key is invalid or missing');

        if (status === 429 && /^\d{1,6}$/.test(retryAfter)) {
          delay = Math.max(delay, Number(retryAfter) * 1000);
        }

        if (
          status < 500 &&
          status !== 429 &&
          !(status === 409 && error?.name === 'concurrent_idempotent_requests')
        ) {
          return { reason: `resend-${status}` };
        }
      }
      if (attempt < 3 || delay > 15000) return { reason: 'retry_exhausted' };

      await checkpoint();
      await sleep(delay, undefined, { signal });
      await checkpoint();
    }
    throw new Error('Unreachable retry state');
  }
}
