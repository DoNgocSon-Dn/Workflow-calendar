import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { TaskDeadlinesCronService } from './task-deadlines-cron.service';

@Module({
  imports: [SupabaseModule, AuthModule, RealtimeModule],
  controllers: [GroupsController],
  providers: [GroupsService, TaskDeadlinesCronService],
  exports: [GroupsService],
})
export class GroupsModule {}
