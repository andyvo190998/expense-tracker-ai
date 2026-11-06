import z from 'zod';

export const TOPIC = 'expense.created.v1';

export const DLQ = 'expense.created.v1.dlq';

export const expenseCreated = z.strictObject({
  type: z.literal(TOPIC),
  event_id: z.uuid(),
  expense_id: z.uuid(),
  occurred_at: z.iso.datetime({ offset: true }),
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
