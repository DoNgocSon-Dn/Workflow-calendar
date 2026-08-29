export interface AttendeeRow {
  id: string;
  /** NULL khi khách được mời qua email chưa có tài khoản Workflow. */
  user_id: string | null;
  email: string;
  status: 'pending' | 'accepted' | 'declined';
}

export interface AttendeeDto {
  id: string;
  userId: string | null;
  email: string;
  status: 'pending' | 'accepted' | 'declined';
}

export function toAttendeeDto(row: AttendeeRow): AttendeeDto {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    status: row.status,
  };
}
