import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { PushModule } from '../push/push.module';
import { RemindersController } from './reminders.controller';
import { RemindersCronService } from './reminders-cron.service';
import { RemindersService } from './reminders.service';

@Module({
  imports: [AuthModule, MailModule, PushModule],
  controllers: [RemindersController],
  providers: [RemindersService, RemindersCronService],
})
export class RemindersModule {}
