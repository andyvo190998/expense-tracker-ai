export type ExpenseNotification = Readonly<{
  eventId: string;
  occurredAt: Date;
  recipients: readonly string[];
}>;

export function sendDeadline(notification: ExpenseNotification): number {
  return notification.occurredAt.getTime() + 23 * 50 * 60 * 1000;
}
