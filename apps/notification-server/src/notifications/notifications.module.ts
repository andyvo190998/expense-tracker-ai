import { Module } from '@nestjs/common';
import { BrevoEmailSender } from './infrastructure/brevo/brevo-email.sender.js';
import { NotifyExpenseCreated } from './application/notify-expense-created.js';
import { ExpenseCreatedConsumer } from './infrastructure/kafka/expense-created.consumer.js';

@Module({
  providers: [
    BrevoEmailSender,
    {
      provide: NotifyExpenseCreated,
      inject: [BrevoEmailSender],
      useFactory: (sender: BrevoEmailSender) =>
        new NotifyExpenseCreated(sender),
    },
    ExpenseCreatedConsumer,
  ],
})
export class NotificationsModule {}
