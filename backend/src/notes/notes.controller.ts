import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { CurrentSupabase } from '../auth/current-supabase.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { NotesService } from './notes.service';

@Controller('notes')
@UseGuards(SupabaseAuthGuard)
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  findAll(@CurrentSupabase() supabase: SupabaseClient) {
    return this.notesService.findAllForUser(supabase);
  }

  // Phải khai TRƯỚC mọi route ':id' để "trash" không bị nuốt thành một id.
  @Get('trash')
  findTrash(@CurrentSupabase() supabase: SupabaseClient) {
    return this.notesService.findTrashedForUser(supabase);
  }

  @Post()
  create(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Body() dto: CreateNoteDto,
  ) {
    return this.notesService.create(supabase, user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notesService.update(supabase, id, dto);
  }

  /** Xoá mềm — chuyển vào Thùng rác. */
  @Delete(':id')
  remove(@CurrentSupabase() supabase: SupabaseClient, @Param('id') id: string) {
    return this.notesService.remove(supabase, id);
  }

  @Post(':id/restore')
  restore(@CurrentSupabase() supabase: SupabaseClient, @Param('id') id: string) {
    return this.notesService.restore(supabase, id);
  }

  /** Xoá vĩnh viễn khỏi Thùng rác. */
  @Delete(':id/permanent')
  purge(@CurrentSupabase() supabase: SupabaseClient, @Param('id') id: string) {
    return this.notesService.purge(supabase, id);
  }
}
