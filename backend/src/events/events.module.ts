import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { PushModule } from '../push/push.module';
import { ReminderPreferencesModule } from '../reminder-preferences/reminder-preferences.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { PublicRespondController } from './public-respond.controller';
import { RecurrenceCronService } from './recurrence-cron.service';

@Module({
  imports: [AuthModule, MailModule, PushModule, ReminderPreferencesModule],
  controllers: [EventsController, PublicRespondController],
  providers: [EventsService, RecurrenceCronService],
  exports: [EventsService],
})
export class EventsModule {}
