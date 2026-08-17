import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { IcsImportService } from './services/ics-import.service';
import { AiFileImportService } from './services/ai-file-import.service';

@Module({
  imports: [AuthModule, EventsModule],
  controllers: [ImportController],
  providers: [ImportService, IcsImportService, AiFileImportService],
})
export class ImportModule {}
