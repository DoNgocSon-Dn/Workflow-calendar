import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { ImportModule } from '../import/import.module';
import { TodosModule } from '../todos/todos.module';
import { NotesModule } from '../notes/notes.module';
import { GroupsModule } from '../groups/groups.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [AuthModule, EventsModule, ImportModule, TodosModule, NotesModule, GroupsModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
