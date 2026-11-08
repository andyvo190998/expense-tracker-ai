import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import z from 'zod';
import type {
  DeliveryContext,
  DeliveryOutcome,
  EmailRequest,
  EmailSender,
} from '../../application/email-sender.js';
import { required } from '../config.js';

type SmtpFailure = Error & {
  code?: string;
  command?: string;
  responseCode?: number;
};

@Injectable()
export class BrevoEmailSender implements EmailSender {
  private readonly sender = z.email().parse(required('BREVO_FROM_EMAIL'));
  private readonly senderName =
    process.env.BREVO_FROM_NAME?.trim() || 'Expense Tracker';
  private readonly smtp: Transporter<SMTPTransport.SentMessageInfo>;

  constructor() {
    const port = Number(process.env.BREVO_SMTP_PORT ?? '587');
    if (![465, 587, 2525].includes(port)) {
      throw new Error('Brevo SMTP port must be 465, 587 or 2525');
    }
    this.smtp = nodemailer.createTransport({
      host: process.env.BREVO_SMTP_HOST?.trim() || 'smtp-relay.brevo.com',
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: {
        user: required('BREVO_SMTP_USER'),
        pass: required('BREVO_SMTP_PASSWORD'),
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
  }

  async send(
    email: EmailRequest,
    { signal, checkpoint }: DeliveryContext,
  ): Promise<DeliveryOutcome> {
    const recipientId = createHash('sha256')
      .update(email.recipients)
      .digest('hex')
      .slice(0, 32);
    // A stable Message-ID aids tracing. SMTP does not guarantee deduplication.
    const messageId = `<${email.eventId}.${recipientId}@${this.sender.split('@')[1]}>`;
    const message = {
      from: { address: this.sender, name: this.senderName },
      to: [{ address: email.recipients }],
      subject: email.subject,
      text: email.text,
      html: email.html,
      messageId,
    };

    for (let attempt = 0; attempt < 4; attempt++) {
      signal.throwIfAborted();
      if (Date.now() >= email.deadline) return { reason: 'expired' };

      try {
        const info = await this.smtp.sendMail(message);
        signal.throwIfAborted();
        if (info.accepted.length === 0) {
          return { reason: 'smtp_recipient_rejected' };
        }
        return { acceptId: info.messageId };
      } catch (error) {
        signal.throwIfAborted();
        const failure = error as SmtpFailure;
        if (['EAUTH', 'ENOAUTH', 'ETLS'].includes(failure?.code ?? '')) {
          throw new Error(
            `Brevo SMTP configuration rejected (${failure.code})`,
          );
        }
        const status = failure?.responseCode;
        if (typeof status === 'number' && status >= 500) {
          return { reason: `brevo_smtp_${status}` };
        }
        const temporarilyRejected =
          typeof status === 'number' && status >= 400 && status < 500;
        const notSubmitted =
          failure?.command === 'CONN' || failure?.code === 'EDNS';
        if (!temporarilyRejected && !notSubmitted) {
          // The server may have accepted DATA before the connection failed.
          return { reason: 'smtp_delivery_uncertain' };
        }
      }

      if (attempt === 3) return { reason: 'retry_exhausted' };
      await checkpoint();
      await sleep(1000 * 2 ** attempt, undefined, { signal });
      await checkpoint();
    }
    throw new Error('Unreachable retry state');
  }
}
