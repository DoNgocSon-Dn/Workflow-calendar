import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { CurrentSupabase } from '../auth/current-supabase.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CreateTodoListDto } from './dto/create-todo-list.dto';
import { UpdateTodoListDto } from './dto/update-todo-list.dto';
import { TodoListsService } from './todo-lists.service';

@Controller('todo-lists')
@UseGuards(SupabaseAuthGuard)
export class TodoListsController {
  constructor(private readonly todoListsService: TodoListsService) {}

  @Get()
  findAll(@CurrentSupabase() supabase: SupabaseClient) {
    return this.todoListsService.findAllForUser(supabase);
  }

  @Post()
  create(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Body() dto: CreateTodoListDto,
  ) {
    return this.todoListsService.create(supabase, user.id, dto);
  }

  @Patch(':id')
  rename(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') id: string,
    @Body() dto: UpdateTodoListDto,
  ) {
    return this.todoListsService.rename(supabase, id, dto);
  }

  @Delete(':id')
  remove(@CurrentSupabase() supabase: SupabaseClient, @Param('id') id: string) {
    return this.todoListsService.remove(supabase, id);
  }
}
