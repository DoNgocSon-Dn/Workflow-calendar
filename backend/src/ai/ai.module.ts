import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { ImportModule } from '../import/import.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [AuthModule, EventsModule, ImportModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
