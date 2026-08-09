import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from './ai/ai.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CalendarsModule } from './calendars/calendars.module';
import { CommentsModule } from './comments/comments.module';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { EventsModule } from './events/events.module';
import { MailModule } from './mail/mail.module';
import { NotesModule } from './notes/notes.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RemindersModule } from './reminders/reminders.module';
import { SupabaseModule } from './supabase/supabase.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },
      { name: 'ai-chat', ttl: 60 * 60 * 1000, limit: 20 },
      { name: 'respond-email', ttl: 60_000, limit: 10 },
    ]),
    SupabaseModule,
    RealtimeModule,
    AuthModule,
    CalendarsModule,
    EventsModule,
    RemindersModule,
    MailModule,
    NotesModule,
    CommentsModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
