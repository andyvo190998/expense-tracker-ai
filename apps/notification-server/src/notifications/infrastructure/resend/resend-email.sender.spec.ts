import { afterEach, expect, it, vi } from 'vitest';
import { ResendEmailSender } from './resend-email.sender.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([undefined, '<h1>Expense added</h1>'])(
  'submits HTML when present and preserves legacy JSON when absent (%s)',
  async (html) => {
    vi.stubEnv('RESEND_FROM', 'notifications@example.com');
    vi.stubEnv('RESEND_API_KEY', 'test-only');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: 'email-test-id' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await new ResendEmailSender().send(
      {
        eventId: '11111111-1111-4111-8111-111111111111',
        recipients: 'owner@example.com',
        subject: 'Expense Created',
        text: 'A new expense was added to your expense tracker.',
        html,
        deadline: Date.now() + 60_000,
      },
      { signal: new AbortController().signal, checkpoint: async () => {} },
    );
    expect(result).toEqual({ acceptId: 'email-test-id' });
    const requestBody = fetchMock.mock.calls[0][1]?.body;
    if (typeof requestBody !== 'string')
      throw new Error('Expected JSON string body');
    const body = JSON.parse(requestBody);
    expect(body.to).toEqual(['owner@example.com']);
    if (html) expect(body.html).toBe(html);
    else expect(body).not.toHaveProperty('html');
  },
);
