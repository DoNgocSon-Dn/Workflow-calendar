import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [SocialController],
  providers: [SocialService],
})
export class SocialModule {}
