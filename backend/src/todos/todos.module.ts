import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TodoListsController } from './todo-lists.controller';
import { TodoListsService } from './todo-lists.service';
import { TodosController } from './todos.controller';
import { TodosService } from './todos.service';

@Module({
  imports: [AuthModule],
  controllers: [TodosController, TodoListsController],
  providers: [TodosService, TodoListsService],
})
export class TodosModule {}
