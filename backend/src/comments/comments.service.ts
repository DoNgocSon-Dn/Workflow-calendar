import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CommentDto, CommentRow, toCommentDto } from './comment.mapper';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentsService {
  constructor(private readonly realtimeGateway: RealtimeGateway) {}

  async listForEvent(supabase: SupabaseClient, eventId: string): Promise<CommentDto[]> {
    const { data, error } = await supabase
      .from('event_comments')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);
    return (data as CommentRow[]).map(toCommentDto);
  }

  async create(
    supabase: SupabaseClient,
    eventId: string,
    userId: string,
    dto: CreateCommentDto,
  ): Promise<CommentDto> {
    const { data: eventRow, error: eventError } = await supabase
      .from('events')
      .select('id, calendar_id')
      .eq('id', eventId)
      .maybeSingle<{ id: string; calendar_id: string }>();
    if (eventError) throw new InternalServerErrorException(eventError.message);
    if (!eventRow) throw new NotFoundException('Event not found');

    const { data, error } = await supabase
      .from('event_comments')
      .insert({ event_id: eventId, user_id: userId, content: dto.content })
      .select('*')
      .returns<CommentRow[]>()
      .single();
    if (error) throw new InternalServerErrorException(error.message);

    const commentDto = toCommentDto(data);
    this.realtimeGateway.emitToCalendar(eventRow.calendar_id, 'comment:created', {
      eventId,
      comment: commentDto,
    });
    return commentDto;
  }

  async remove(supabase: SupabaseClient, id: string): Promise<void> {
    const { data, error } = await supabase
      .from('event_comments')
      .delete()
      .eq('id', id)
      .select('id, event_id')
      .returns<{ id: string; event_id: string }[]>();
    if (error) throw new InternalServerErrorException(error.message);
    if (data.length === 0) throw new NotFoundException('Comment not found');

    const { data: eventRow } = await supabase
      .from('events')
      .select('calendar_id')
      .eq('id', data[0].event_id)
      .maybeSingle<{ calendar_id: string }>();
    if (eventRow) {
      this.realtimeGateway.emitToCalendar(eventRow.calendar_id, 'comment:deleted', {
        eventId: data[0].event_id,
        id: data[0].id,
      });
    }
  }
}
