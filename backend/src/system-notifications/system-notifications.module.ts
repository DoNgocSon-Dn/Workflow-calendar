import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { SystemNotificationsController } from './system-notifications.controller';

@Module({
  imports: [RealtimeModule],
  controllers: [SystemNotificationsController],
})
export class SystemNotificationsModule {}
