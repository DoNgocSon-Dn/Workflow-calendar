export interface AttendeeRow {
  id: string;
  user_id: string;
  email: string;
  status: 'pending' | 'accepted' | 'declined';
}

export interface AttendeeDto {
  id: string;
  userId: string;
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
