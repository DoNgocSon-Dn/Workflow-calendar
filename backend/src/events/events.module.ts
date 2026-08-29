import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { PublicRespondController } from './public-respond.controller';
import { RecurrenceCronService } from './recurrence-cron.service';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [EventsController, PublicRespondController],
  providers: [EventsService, RecurrenceCronService],
  exports: [EventsService],
})
export class EventsModule {}
