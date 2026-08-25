export interface TodoRow {
  id: string;
  user_id: string;
  list_id: string;
  content: string;
  description: string | null;
  done: boolean;
  due_at: string | null;
  starred: boolean;
  created_at: string;
  updated_at: string;
}

export interface TodoDto {
  id: string;
  listId: string;
  content: string;
  description?: string;
  done: boolean;
  dueAt?: string;
  starred: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toTodoDto(row: TodoRow): TodoDto {
  return {
    id: row.id,
    listId: row.list_id,
    content: row.content,
    description: row.description ?? undefined,
    done: row.done,
    dueAt: row.due_at ?? undefined,
    starred: row.starred,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface TodoListRow {
  id: string;
  user_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TodoListDto {
  id: string;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export function toTodoListDto(row: TodoListRow): TodoListDto {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
