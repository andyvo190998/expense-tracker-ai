import { describe, expect, it, vi } from 'vitest';
import type { ExpenseNotification } from '../domain/expense-notification.js';
import type { EmailSender } from './email-sender.js';
import { NotifyExpenseCreated } from './notify-expense-created.js';

const now = Date.UTC(2026, 11, 1);
const base: ExpenseNotification = {
  eventId: '11111111-1111-4111-8111-111111111111',
  occurredAt: new Date(now),
  recipients: ['owner@example.com'],
};
const context = {
  signal: new AbortController().signal,
  checkpoint: async () => {},
};
const summary = {
  expense_amount: '30.20',
  expense_currency: 'EUR',
  month: '2026-12',
  currency: 'EUR' as const,
  budget: '100.00',
  spent: '40.30',
  remaining: '59.70',
  over_budget: '0.00',
  categories: [
    {
      category: '<img src=x onerror=alert(1)>',
      amount: '40.30',
      percentage: '100.0',
    },
  ],
};

describe('expense notification email', () => {
  it('includes exact money, a month label and escaped category HTML', async () => {
    const send = vi
      .fn<EmailSender['send']>()
      .mockResolvedValue({ acceptId: 'test' });
    const useCase = new NotifyExpenseCreated({ send }, () => now);
    await useCase.execute({ ...base, emailSummary: summary }, context);
    const email = send.mock.calls[0][0];
    expect(email.subject).toContain('EUR 30.20');
    expect(email.subject).toContain('EUR 59.70 left');
    expect(email.subject).toContain('December 2026');
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(email.html).not.toContain('<img src=x');
    expect(email.html).toContain('100.0%');
    expect(email.text).toContain('EUR 40.30');
  });

  it('describes an exceeded budget and supports an empty category overview', async () => {
    const send = vi
      .fn<EmailSender['send']>()
      .mockResolvedValue({ acceptId: 'test' });
    await new NotifyExpenseCreated({ send }, () => now).execute(
      {
        ...base,
        emailSummary: {
          ...summary,
          remaining: '0.00',
          over_budget: '10.30',
          categories: [],
        },
      },
      context,
    );
    expect(send.mock.calls[0][0].subject).toContain('EUR 10.30 over budget');
    expect(send.mock.calls[0][0].html).toContain('No EUR expenses');
  });

  it('preserves the original request body for legacy events', async () => {
    const send = vi
      .fn<EmailSender['send']>()
      .mockResolvedValue({ acceptId: 'test' });
    await new NotifyExpenseCreated({ send }, () => now).execute(base, context);
    expect(send.mock.calls[0][0]).toMatchObject({
      subject: 'Expense Created',
      text: 'A new expense was added to your expense tracker.',
    });
    expect(send.mock.calls[0][0].html).toBeUndefined();
  });
});

it('adds category and description to the subject on one line', async () => {
  const send = vi
    .fn<EmailSender['send']>()
    .mockResolvedValue({ acceptId: 'test' });
  await new NotifyExpenseCreated({ send }, () => now).execute(
    {
      ...base,
      emailSummary: {
        ...summary,
        expense_category: 'groceries',
        expense_description: 'Weekly shopping\r\n at Aldi',
      },
    },
    context,
  );
  expect(send.mock.calls[0][0].subject).toBe(
    'EUR 30.20 expense added · groceries · Weekly shopping at Aldi · EUR 59.70 left for December 2026',
  );
});

it.each([null, '', '  '])(
  'handles missing description %s',
  async (description) => {
    const send = vi
      .fn<EmailSender['send']>()
      .mockResolvedValue({ acceptId: 'test' });
    await new NotifyExpenseCreated({ send }, () => now).execute(
      {
        ...base,
        emailSummary: {
          ...summary,
          expense_category: 'groceries',
          expense_description: description,
        },
      },
      context,
    );
    expect(send.mock.calls[0][0].subject).toBe(
      'EUR 30.20 expense added · groceries · EUR 59.70 left for December 2026',
    );
  },
);

it('preserves the subject for older summary events', async () => {
  const send = vi
    .fn<EmailSender['send']>()
    .mockResolvedValue({ acceptId: 'test' });
  await new NotifyExpenseCreated({ send }, () => now).execute(
    {
      ...base,
      emailSummary: summary,
    },
    context,
  );
  expect(send.mock.calls[0][0].subject).toBe(
    'EUR 30.20 expense added · EUR 59.70 left for December 2026',
  );
});
