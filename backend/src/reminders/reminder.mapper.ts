export interface ReminderRow {
  id: string;
  event_id: string;
  user_id: string;
  remind_at: string;
  remind_type: 'popup' | 'email';
  is_sent: boolean;
  snoozed_until: string | null;
  created_at: string;
}

export interface ReminderDto {
  id: string;
  eventId: string;
  remindAt: string;
  type: 'popup' | 'email';
}

export function toReminderDto(row: ReminderRow): ReminderDto {
  return {
    id: row.id,
    eventId: row.event_id,
    remindAt: row.remind_at,
    type: row.remind_type,
  };
}
