import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReminderPreferencesController } from './reminder-preferences.controller';
import { ReminderPreferencesService } from './reminder-preferences.service';

@Module({
  imports: [AuthModule],
  controllers: [ReminderPreferencesController],
  providers: [ReminderPreferencesService],
  exports: [ReminderPreferencesService],
})
export class ReminderPreferencesModule {}
