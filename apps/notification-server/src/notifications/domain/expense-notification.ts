export type ExpenseEmailSummary = Readonly<{
  expense_category?: string | null;
  expense_description?: string | null;
  expense_amount: string;
  expense_currency: string;
  month: string;
  currency: 'EUR';
  budget: string;
  spent: string;
  remaining: string;
  over_budget: string;
  categories: readonly {
    category: string;
    amount: string;
    percentage: string;
  }[];
}>;

export type ExpenseNotification = Readonly<{
  eventId: string;
  occurredAt: Date;
  recipients: readonly string[];
  emailSummary?: ExpenseEmailSummary;
}>;

export function sendDeadline(notification: ExpenseNotification): number {
  return notification.occurredAt.getTime() + 23 * 50 * 60 * 1000;
}
