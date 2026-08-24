import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CreateTodoListDto } from './dto/create-todo-list.dto';
import { UpdateTodoListDto } from './dto/update-todo-list.dto';
import { TodoListDto, TodoListRow, toTodoListDto } from './todo.mapper';

@Injectable()
export class TodoListsService {
  async findAllForUser(supabase: SupabaseClient): Promise<TodoListDto[]> {
    const { data, error } = await supabase
      .from('todo_lists')
      .select('*')
      .order('position', { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);
    return (data as TodoListRow[]).map(toTodoListDto);
  }

  async create(
    supabase: SupabaseClient,
    userId: string,
    dto: CreateTodoListDto,
  ): Promise<TodoListDto> {
    // Danh sách mới luôn xếp cuối — lấy position lớn nhất hiện có của user rồi +1.
    const { data: existing, error: findError } = await supabase
      .from('todo_lists')
      .select('position')
      .order('position', { ascending: false })
      .limit(1);

    if (findError) throw new InternalServerErrorException(findError.message);
    const nextPosition = existing.length > 0 ? (existing[0] as { position: number }).position + 1 : 0;

    const { data, error } = await supabase
      .from('todo_lists')
      .insert({ user_id: userId, name: dto.name, position: nextPosition })
      .select('*')
      .returns<TodoListRow[]>()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return toTodoListDto(data);
  }

  async rename(
    supabase: SupabaseClient,
    id: string,
    dto: UpdateTodoListDto,
  ): Promise<TodoListDto> {
    const { data, error } = await supabase
      .from('todo_lists')
      .update({ name: dto.name })
      .eq('id', id)
      .select('*')
      .returns<TodoListRow[]>();

    if (error) throw new InternalServerErrorException(error.message);
    if (data.length === 0) throw new NotFoundException('Todo list not found');
    return toTodoListDto(data[0]);
  }

  async remove(supabase: SupabaseClient, id: string): Promise<void> {
    // Luôn giữ ít nhất 1 danh sách — xoá cái cuối cùng thì todo còn lại không
    // có chỗ nào để thuộc về (list_id NOT NULL), giao diện cũng mất chỗ hiển thị.
    const { count, error: countError } = await supabase
      .from('todo_lists')
      .select('id', { count: 'exact', head: true });

    if (countError) throw new InternalServerErrorException(countError.message);
    if ((count ?? 0) <= 1) {
      throw new BadRequestException('Không thể xoá danh sách cuối cùng.');
    }

    const { data, error } = await supabase
      .from('todo_lists')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw new InternalServerErrorException(error.message);
    if ((data as { id: string }[]).length === 0) {
      throw new NotFoundException('Todo list not found');
    }
  }
}
