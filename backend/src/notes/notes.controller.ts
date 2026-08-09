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

  @Delete(':id')
  remove(@CurrentSupabase() supabase: SupabaseClient, @Param('id') id: string) {
    return this.notesService.remove(supabase, id);
  }
}
