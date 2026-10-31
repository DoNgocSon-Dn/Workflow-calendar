export interface MobileReminderRow {
  id: string;
  remind_at: string;
  snoozed_until: string | null;
  seen_at: string | null;
  events: { id: string; title: string; start_at: string; deleted_at: string | null };
}

export interface PlannedReminder {
  id: number;
  reminderId: string;
  eventId: string;
  title: string;
  body: string;
  at: number;
}

/** Stable across launches; the owner is part of the identity. Positive Android int32. */
export function mobileNotificationId(owner: string, key: string): number {
  let hash = 2166136261;
  for (const char of `${owner}:${key}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 2147483646 + 1;
}

export function planReminders(owner: string, rows: MobileReminderRow[], now: number): PlannedReminder[] {
  const horizon = now + 30 * 86400000;
  const ids = new Set<number>();
  const unique = new Set<string>();
  return rows.flatMap((row): PlannedReminder[] => {
    if (!row || typeof row.id !== 'string' || unique.has(row.id) || row.seen_at ||
        !row.events || row.events.deleted_at || typeof row.events.title !== 'string') return [];
    const at = Date.parse(row.snoozed_until ?? row.remind_at);
    if (!Number.isFinite(at) || at <= now || at > horizon) return [];
    unique.add(row.id);
    return [{ id: mobileNotificationId(owner, `reminder-${row.id}`), reminderId: row.id,
      eventId: row.events.id, title: row.events.title.slice(0, 160),
      body: new Date(row.events.start_at).toLocaleString('vi-VN'), at }];
  }).sort((a, b) => a.at - b.at || a.reminderId.localeCompare(b.reminderId))
    .slice(0, 128).map((item) => {
      while (ids.has(item.id)) item.id = item.id % 2147483646 + 1;
      ids.add(item.id);
      return item;
    });
}
