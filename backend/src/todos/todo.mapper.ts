export interface TodoRow {
  id: string;
  user_id: string;
  content: string;
  done: boolean;
  created_at: string;
  updated_at: string;
}

export interface TodoDto {
  id: string;
  content: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toTodoDto(row: TodoRow): TodoDto {
  return {
    id: row.id,
    content: row.content,
    done: row.done,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
