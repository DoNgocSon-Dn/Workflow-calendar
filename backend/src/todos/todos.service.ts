import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { TodoDto, TodoRow, toTodoDto } from './todo.mapper';

@Injectable()
export class TodosService {
  async findAllForUser(supabase: SupabaseClient): Promise<TodoDto[]> {
    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return (data as TodoRow[]).map(toTodoDto);
  }

  async create(
    supabase: SupabaseClient,
    userId: string,
    dto: CreateTodoDto,
  ): Promise<TodoDto> {
    const { data, error } = await supabase
      .from('todos')
      .insert({
        user_id: userId,
        content: dto.content,
        list_id: dto.listId,
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.dueAt !== undefined ? { due_at: dto.dueAt } : {}),
      })
      .select('*')
      .returns<TodoRow[]>()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return toTodoDto(data);
  }

  async update(
    supabase: SupabaseClient,
    id: string,
    dto: UpdateTodoDto,
  ): Promise<TodoDto> {
    // Cột DB dùng snake_case (list_id, due_at) trong khi DTO dùng camelCase
    // (listId, dueAt) — không thể spread thẳng dto vào .update(), phải map
    // lại từng trường.
    const row: Record<string, unknown> = {};
    if (dto.content !== undefined) row['content'] = dto.content;
    if (dto.done !== undefined) row['done'] = dto.done;
    if (dto.listId !== undefined) row['list_id'] = dto.listId;
    if (dto.description !== undefined) row['description'] = dto.description;
    if (dto.starred !== undefined) row['starred'] = dto.starred;
    if (dto.clearDueAt) row['due_at'] = null;
    else if (dto.dueAt !== undefined) row['due_at'] = dto.dueAt;

    const { data, error } = await supabase
      .from('todos')
      .update(row)
      .eq('id', id)
      .select('*')
      .returns<TodoRow[]>();

    if (error) throw new InternalServerErrorException(error.message);
    if (data.length === 0) {
      throw new NotFoundException('Todo not found');
    }
    return toTodoDto(data[0]);
  }

  async remove(supabase: SupabaseClient, id: string): Promise<void> {
    const { data, error } = await supabase
      .from('todos')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw new InternalServerErrorException(error.message);
    if ((data as { id: string }[]).length === 0) {
      throw new NotFoundException('Todo not found');
    }
  }
}
