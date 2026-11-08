import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrevoEmailSender } from './brevo-email.sender.js';

const { sendMail, createTransport } = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));
vi.mock('nodemailer', () => ({ default: { createTransport } }));
vi.mock('node:timers/promises', () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));

const email = {
  eventId: '11111111-1111-4111-8111-111111111111',
  recipients: 'owner@example.com',
  subject: 'EUR 30.20 · groceries · Weekly shopping · EUR 59.70 left',
  text: 'The original plain-text budget overview.',
  html: '<h1>The original HTML budget overview</h1>',
  deadline: Date.now() + 60_000,
};
const context = () => ({
  signal: new AbortController().signal,
  checkpoint: vi.fn(async () => {}),
});
function smtpError(code: string, responseCode?: number, command?: string) {
  return Object.assign(new Error('SMTP failure'), {
    code,
    responseCode,
    command,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sendMail.mockReset();
  createTransport.mockReturnValue({ sendMail });
  vi.stubEnv('BREVO_SMTP_HOST', 'smtp-relay.brevo.com');
  vi.stubEnv('BREVO_SMTP_PORT', '587');
  vi.stubEnv('BREVO_SMTP_USER', 'test@smtp-brevo.com');
  vi.stubEnv('BREVO_SMTP_PASSWORD', 'test-smtp-key');
  vi.stubEnv('BREVO_FROM_EMAIL', 'notifications@example.com');
  vi.stubEnv('BREVO_FROM_NAME', 'Expense Tracker');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

it('uses port 587 with mandatory STARTTLS and SMTP credentials', async () => {
  sendMail.mockResolvedValue({
    accepted: [email.recipients],
    messageId: '<accepted@example.com>',
  });
  expect(await new BrevoEmailSender().send(email, context())).toEqual({
    acceptId: '<accepted@example.com>',
  });
  expect(createTransport).toHaveBeenCalledWith(
    expect.objectContaining({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'test@smtp-brevo.com', pass: 'test-smtp-key' },
    }),
  );
  expect(sendMail).toHaveBeenCalledWith(
    expect.objectContaining({
      from: { address: 'notifications@example.com', name: 'Expense Tracker' },
      to: [{ address: email.recipients }],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  );
});

it('uses implicit TLS for port 465', () => {
  vi.stubEnv('BREVO_SMTP_PORT', '465');
  new BrevoEmailSender();
  expect(createTransport).toHaveBeenCalledWith(
    expect.objectContaining({
      port: 465,
      secure: true,
    }),
  );
});

it.each(['bad', '0', '25'])('rejects unsupported SMTP port %s', (port) => {
  vi.stubEnv('BREVO_SMTP_PORT', port);
  expect(() => new BrevoEmailSender()).toThrow('SMTP port');
});

it('supports the legacy plain-text message', async () => {
  sendMail.mockResolvedValue({
    accepted: [email.recipients],
    messageId: '<accepted@example.com>',
  });
  await new BrevoEmailSender().send({ ...email, html: undefined }, context());
  expect(sendMail.mock.calls[0][0].text).toBe(email.text);
  expect(sendMail.mock.calls[0][0].html).toBeUndefined();
});

it('retries a temporary SMTP rejection with identical message content', async () => {
  sendMail
    .mockRejectedValueOnce(smtpError('EENVELOPE', 450, 'RCPT TO'))
    .mockResolvedValueOnce({
      accepted: [email.recipients],
      messageId: '<accepted@example.com>',
    });
  const options = context();
  expect(await new BrevoEmailSender().send(email, options)).toEqual({
    acceptId: '<accepted@example.com>',
  });
  expect(sendMail.mock.calls[0][0]).toEqual(sendMail.mock.calls[1][0]);
  expect(options.checkpoint).toHaveBeenCalledTimes(2);
});

it('retries connection failures before a message has been submitted', async () => {
  sendMail
    .mockRejectedValueOnce(smtpError('ESOCKET', undefined, 'CONN'))
    .mockResolvedValueOnce({
      accepted: [email.recipients],
      messageId: '<accepted@example.com>',
    });
  expect(await new BrevoEmailSender().send(email, context())).toEqual({
    acceptId: '<accepted@example.com>',
  });
});

it('exhausts four attempts on temporary rejection', async () => {
  sendMail.mockRejectedValue(smtpError('EENVELOPE', 450, 'RCPT TO'));
  expect(await new BrevoEmailSender().send(email, context())).toEqual({
    reason: 'retry_exhausted',
  });
  expect(sendMail).toHaveBeenCalledTimes(4);
});

it('does not automatically repeat an uncertain submission after DATA', async () => {
  sendMail.mockRejectedValue(smtpError('ETIMEDOUT', undefined, 'DATA'));
  expect(await new BrevoEmailSender().send(email, context())).toEqual({
    reason: 'smtp_delivery_uncertain',
  });
  expect(sendMail).toHaveBeenCalledTimes(1);
});

it.each(['EAUTH', 'ENOAUTH', 'ETLS'])(
  'throws on %s so the record remains pending',
  async (code) => {
    sendMail.mockRejectedValue(
      smtpError(code, code === 'EAUTH' ? 535 : undefined),
    );
    await expect(new BrevoEmailSender().send(email, context())).rejects.toThrow(
      'Brevo SMTP',
    );
  },
);

it('does not retry a permanent recipient rejection', async () => {
  sendMail.mockRejectedValue(smtpError('EENVELOPE', 550, 'RCPT TO'));
  expect(await new BrevoEmailSender().send(email, context())).toEqual({
    reason: 'brevo_smtp_550',
  });
  expect(sendMail).toHaveBeenCalledTimes(1);
});

it('does not claim success if the recipient was not accepted', async () => {
  sendMail.mockResolvedValue({
    accepted: [],
    messageId: '<local-id@example.com>',
  });
  expect(await new BrevoEmailSender().send(email, context())).toEqual({
    reason: 'smtp_recipient_rejected',
  });
});

it('does not send expired or cancelled messages', async () => {
  expect(
    await new BrevoEmailSender().send({ ...email, deadline: 0 }, context()),
  ).toEqual({ reason: 'expired' });
  const controller = new AbortController();
  controller.abort();
  await expect(
    new BrevoEmailSender().send(email, {
      ...context(),
      signal: controller.signal,
    }),
  ).rejects.toThrow();
  expect(sendMail).not.toHaveBeenCalled();
});
