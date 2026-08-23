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
import { GroupsModule } from './groups/groups.module';
import { ImportModule } from './import/import.module';
import { MailModule } from './mail/mail.module';
import { NotesModule } from './notes/notes.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RemindersModule } from './reminders/reminders.module';
import { SupabaseModule } from './supabase/supabase.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate }),
    ScheduleModule.forRoot(),
    // CHỈ khai báo một throttler ở đây. ThrottlerGuard duyệt MỌI throttler đã
    // khai báo cho MỌI route (xem canActivate trong @nestjs/throttler), nên khai
    // báo thêm 'ai-chat' 20 req/giờ ở đây đồng nghĩa toàn bộ API bị chặn sau 20
    // request mỗi giờ — @Throttle ở AiController chỉ đổi hạn mức cho route đó chứ
    // không giới hạn phạm vi áp dụng. Hạn mức riêng cho từng route được đặt bằng
    // cách ghi đè 'default' ngay tại handler.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
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
    ImportModule,
    GroupsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
