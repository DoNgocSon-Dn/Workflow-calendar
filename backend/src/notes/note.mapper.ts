export interface NoteRow {
  id: string;
  user_id: string;
  content: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface NoteDto {
  id: string;
  content: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export function toNoteDto(row: NoteRow): NoteDto {
  return {
    id: row.id,
    content: row.content,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
