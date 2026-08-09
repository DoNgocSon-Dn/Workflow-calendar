export interface CommentRow {
  id: string;
  event_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface CommentDto {
  id: string;
  eventId: string;
  userId: string;
  content: string;
  createdAt: string;
}

export function toCommentDto(row: CommentRow): CommentDto {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    content: row.content,
    createdAt: row.created_at,
  };
}
