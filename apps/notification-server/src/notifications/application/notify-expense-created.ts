import {
  ExpenseNotification,
  sendDeadline,
} from '../domain/expense-notification.js';
import {
  DeliveryContext,
  DeliveryOutcome,
  EmailSender,
} from './email-sender.js';

export class NotifyExpenseCreated {
  constructor(
    private readonly sender: EmailSender,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(
    notification: ExpenseNotification,
    context: DeliveryContext,
  ): Promise<DeliveryOutcome[]> {
    const deadlineMs = sendDeadline(notification);
    const outcomes: DeliveryOutcome[] = [];

    for (const recipient of notification.recipients) {
      context.signal.throwIfAborted();

      if (this.now() >= deadlineMs) {
        outcomes.push({ reason: 'expired' });
        continue;
      }

      await context.checkpoint();
      outcomes.push(
        await this.sender.send(
          {
            eventId: notification.eventId,
            recipients: recipient,
            subject: 'Expense Created',
            text: 'A new expense was added to your expense tracker.',
            deadline: deadlineMs,
          },
          context,
        ),
      );
    }

    return outcomes;
  }
}
