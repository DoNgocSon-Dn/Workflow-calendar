export interface NoteRow {
  id: string;
  user_id: string;
  content: string;
  color: string;
  pinned_date: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteDto {
  id: string;
  content: string;
  color: string;
  /** Có giá trị khi ghi chú đã được "dán" lên một ngày trên lịch. */
  pinnedDate?: string;
  /** Có giá trị khi ghi chú đang nằm trong Thùng rác (đã xoá mềm). */
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function toNoteDto(row: NoteRow): NoteDto {
  return {
    id: row.id,
    content: row.content,
    color: row.color,
    pinnedDate: row.pinned_date ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
