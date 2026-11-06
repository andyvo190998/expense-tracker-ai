import { Module } from '@nestjs/common';
import { ResendEmailSender } from './infrastructure/resend/resend-email.sender.js';
import { NotifyExpenseCreated } from './application/notify-expense-created.js';
import { ExpenseCreatedConsumer } from './infrastructure/kafka/expense-created.consumer.js';

@Module({
  providers: [
    ResendEmailSender,
    {
      provide: NotifyExpenseCreated,
      inject: [ResendEmailSender],
      useFactory: (sender: ResendEmailSender) =>
        new NotifyExpenseCreated(sender),
    },
    ExpenseCreatedConsumer,
  ],
})
export class NotificationsModule {}
