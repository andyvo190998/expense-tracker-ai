import { expect, it } from 'vitest';
import { parseEvent, TOPIC } from './expense-created.v1.js';

const legacy = {
  type: TOPIC,
  event_id: '11111111-1111-4111-8111-111111111111',
  expense_id: '22222222-2222-4222-8222-222222222222',
  occurred_at: '2026-12-01T00:00:00.000000Z',
  recipients: ['owner@example.com'],
};
const summary = {
  expense_amount: '30.20',
  expense_currency: 'EUR',
  month: '2026-12',
  currency: 'EUR',
  budget: '100.00',
  spent: '40.30',
  remaining: '59.70',
  over_budget: '0.00',
  categories: [{ category: 'groceries', amount: '40.30', percentage: '100.0' }],
};
const parse = (value: unknown) =>
  parseEvent(Buffer.from(JSON.stringify(value)));

it('accepts legacy and enriched event shapes', () => {
  expect(parse(legacy)).toEqual(legacy);
  expect(parse({ ...legacy, email_summary: summary })?.email_summary).toEqual(
    summary,
  );
});

it('rejects invalid money, months and percentage styles at the boundary', () => {
  for (const patch of [
    { remaining: -10 },
    { remaining: '59.701' },
    { month: '2026-13' },
    {
      categories: [
        { category: 'groceries', amount: '40.30', percentage: '101.0' },
      ],
    },
    {
      categories: [
        {
          category: 'groceries',
          amount: '40.30',
          percentage: '0;display:none',
        },
      ],
    },
  ]) {
    expect(
      parse({ ...legacy, email_summary: { ...summary, ...patch } }),
    ).toBeUndefined();
  }
});
