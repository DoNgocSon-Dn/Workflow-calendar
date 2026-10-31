import { describe, expect, it } from 'vitest';
import { MobileReminderRow, mobileNotificationId, planReminders } from './reminder-plan';

const now = Date.parse('2026-10-31T08:00:00Z');
const row = (id: string, delta = 60000): MobileReminderRow => ({ id,
  remind_at: new Date(now + delta).toISOString(), snoozed_until: null, seen_at: null,
  events: { id: `event-${id}`, title: 'Họp nhóm', start_at: new Date(now + delta).toISOString(), deleted_at: null },
});

describe('Android reminder plan', () => {
  it('isolates owners and keeps stable positive int32 identities', () => {
    expect(mobileNotificationId('a', 'x')).toBe(mobileNotificationId('a', 'x'));
    expect(mobileNotificationId('a', 'x')).not.toBe(mobileNotificationId('b', 'x'));
    expect(mobileNotificationId('a', 'x')).toBeGreaterThan(0);
    expect(mobileNotificationId('a', 'x')).toBeLessThan(2147483647);
  });
  it('excludes deleted, read, past, invalid and out-of-window alarms', () => {
    expect(planReminders('a', [row('past', -1), row('far', 31 * 86400000),
      { ...row('bad'), remind_at: 'bad' }, { ...row('read'), seen_at: '2026-10-31' },
      { ...row('deleted'), events: { ...row('deleted').events, deleted_at: '2026-10-31' } }, row('ok')], now)
      .map((r) => r.reminderId)).toEqual(['ok']);
  });
  it('uses snooze time even when the original reminder is in the past', () => {
    const item = { ...row('snoozed', -60000), snoozed_until: new Date(now + 300000).toISOString() };
    expect(planReminders('a', [item], now)[0].at).toBe(now + 300000);
  });
  it('deduplicates and prioritizes the earliest 128 alarms', () => {
    const rows = Array.from({ length: 140 }, (_, i) => row(String(i), (140 - i) * 1000));
    const plan = planReminders('a', [...rows, rows[0]], now);
    expect(plan).toHaveLength(128);
    expect(plan[0].at).toBe(now + 1000);
    expect(new Set(plan.map((r) => r.id)).size).toBe(128);
  });
});
