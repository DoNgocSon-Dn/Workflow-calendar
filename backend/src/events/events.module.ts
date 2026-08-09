import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { PublicRespondController } from './public-respond.controller';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [EventsController, PublicRespondController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
