import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { RemindersController } from './reminders.controller';
import { RemindersCronService } from './reminders-cron.service';
import { RemindersService } from './reminders.service';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [RemindersController],
  providers: [RemindersService, RemindersCronService],
})
export class RemindersModule {}
