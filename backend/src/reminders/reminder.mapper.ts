export interface ReminderRow {
  id: string;
  event_id: string;
  user_id: string;
  remind_at: string;
  remind_type: 'popup' | 'email';
  is_sent: boolean;
  seen_at: string | null;
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

/** Một nhắc lịch đã BẮN (cron đã xử lý) nhưng client chưa từng nhận được —
 *  do offline đúng lúc đó. Dùng để hiện lại y hệt như vừa nhận realtime. */
export interface MissedReminderRow {
  id: string;
  event_id: string;
  remind_at: string;
  events: { title: string; start_at: string } | null;
}

export interface MissedReminderDto {
  reminderId: string;
  eventId: string;
  title: string;
  startAt: string;
}

export function toMissedReminderDto(row: MissedReminderRow): MissedReminderDto {
  return {
    reminderId: row.id,
    eventId: row.event_id,
    title: row.events?.title ?? 'Sự kiện',
    startAt: row.events?.start_at ?? row.remind_at,
  };
}
