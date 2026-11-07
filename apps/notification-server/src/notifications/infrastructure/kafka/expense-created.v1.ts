import z from 'zod';

export const TOPIC = 'expense.created.v1';

export const DLQ = 'expense.created.v1.dlq';

const money = z.string().regex(/^(0|[1-9]\d*)\.\d{2}$/);
const emailSummary = z.strictObject({
  expense_category: z.string().nullable().optional(),
  expense_description: z.string().nullable().optional(),
  expense_amount: money,
  expense_currency: z.string().length(3),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  currency: z.literal('EUR'),
  budget: money,
  spent: money,
  remaining: money,
  over_budget: money,
  categories: z.array(
    z.strictObject({
      category: z.string(),
      amount: money,
      percentage: z.string().regex(/^(100\.0|\d{1,2}\.\d)$/),
    }),
  ),
});

export const expenseCreated = z.strictObject({
  type: z.literal(TOPIC),
  event_id: z.uuid(),
  expense_id: z.uuid(),
  occurred_at: z.iso.datetime({ offset: true }),
  email_summary: emailSummary.optional(),
  recipients: z
    .array(z.email({ pattern: z.regexes.unicodeEmail }))
    .min(1)
    .max(5),
});

export type ExpenseCreated = z.infer<typeof expenseCreated>;

export function parseEvent(value: Buffer | null): ExpenseCreated | undefined {
  if (!value) {
    return;
  }

  try {
    const result = expenseCreated.safeParse(JSON.parse(value.toString('utf8')));
    if (result.success) {
      return result.data;
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
  }
}
