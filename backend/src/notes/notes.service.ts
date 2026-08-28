import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { NoteDto, NoteRow, toNoteDto } from './note.mapper';

@Injectable()
export class NotesService {
  async findAllForUser(supabase: SupabaseClient): Promise<NoteDto[]> {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return (data as NoteRow[]).map(toNoteDto);
  }

  /** Ghi chú đã xoá mềm — hiển thị trong "Thùng rác ghi chú", mới nhất lên đầu. */
  async findTrashedForUser(supabase: SupabaseClient): Promise<NoteDto[]> {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return (data as NoteRow[]).map(toNoteDto);
  }

  async create(
    supabase: SupabaseClient,
    userId: string,
    dto: CreateNoteDto,
  ): Promise<NoteDto> {
    const { data, error } = await supabase
      .from('notes')
      .insert({ user_id: userId, content: dto.content, color: dto.color })
      .select('*')
      .returns<NoteRow[]>()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return toNoteDto(data);
  }

  async update(
    supabase: SupabaseClient,
    id: string,
    dto: UpdateNoteDto,
  ): Promise<NoteDto> {
    // Cột DB dùng snake_case (pinned_date) trong khi DTO dùng camelCase
    // (pinnedDate) — không thể spread thẳng dto vào .update() như trước nữa.
    const row: Record<string, unknown> = {};
    if (dto.content !== undefined) row['content'] = dto.content;
    if (dto.color !== undefined) row['color'] = dto.color;
    if (dto.clearPinnedDate) row['pinned_date'] = null;
    else if (dto.pinnedDate !== undefined) row['pinned_date'] = dto.pinnedDate;

    const { data, error } = await supabase
      .from('notes')
      .update(row)
      .eq('id', id)
      .select('*')
      .returns<NoteRow[]>();

    if (error) throw new InternalServerErrorException(error.message);
    if (data.length === 0) {
      throw new NotFoundException('Note not found');
    }
    return toNoteDto(data[0]);
  }

  /** Xoá MỀM — chuyển ghi chú vào Thùng rác (set deleted_at), vẫn khôi phục
   *  được. Chặn xoá lại một ghi chú đã ở trong thùng rác. */
  async remove(supabase: SupabaseClient, id: string): Promise<void> {
    const { data, error } = await supabase
      .from('notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null)
      .select('id');

    if (error) throw new InternalServerErrorException(error.message);
    if ((data as { id: string }[]).length === 0) {
      throw new NotFoundException('Note not found');
    }
  }

  /** Đưa ghi chú từ Thùng rác trở lại danh sách. */
  async restore(supabase: SupabaseClient, id: string): Promise<NoteDto> {
    const { data, error } = await supabase
      .from('notes')
      .update({ deleted_at: null })
      .eq('id', id)
      .not('deleted_at', 'is', null)
      .select('*')
      .returns<NoteRow[]>();

    if (error) throw new InternalServerErrorException(error.message);
    if (data.length === 0) {
      throw new NotFoundException('Note not found in trash');
    }
    return toNoteDto(data[0]);
  }

  /** Xoá VĨNH VIỄN khỏi bảng — chỉ cho ghi chú đang trong Thùng rác. */
  async purge(supabase: SupabaseClient, id: string): Promise<void> {
    const { data, error } = await supabase
      .from('notes')
      .delete()
      .eq('id', id)
      .not('deleted_at', 'is', null)
      .select('id');

    if (error) throw new InternalServerErrorException(error.message);
    if ((data as { id: string }[]).length === 0) {
      throw new NotFoundException('Note not found in trash');
    }
  }
}
