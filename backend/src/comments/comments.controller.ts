import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { CurrentSupabase } from '../auth/current-supabase.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('events/:eventId/comments')
  listForEvent(
    @CurrentSupabase() supabase: SupabaseClient,
    @Param('eventId') eventId: string,
  ) {
    return this.commentsService.listForEvent(supabase, eventId);
  }

  @Post('events/:eventId/comments')
  create(
    @CurrentSupabase() supabase: SupabaseClient,
    @CurrentUser() user: User,
    @Param('eventId') eventId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(supabase, eventId, user.id, dto);
  }

  @Delete('comments/:id')
  remove(@CurrentSupabase() supabase: SupabaseClient, @Param('id') id: string) {
    return this.commentsService.remove(supabase, id);
  }
}
