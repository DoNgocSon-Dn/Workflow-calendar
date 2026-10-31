import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../auth/auth-store';
import { SUPABASE_CLIENT } from '../supabase-client';
import { NotificationSoundService } from '../services/notification-sound.service';
import { MOBILE_NOTIFICATION_PLUGIN, MobileNotificationsService } from './mobile-notifications.service';

function setup() {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
  vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
  localStorage.setItem('workflow-android-alarm-owner', 'a');
  const user = signal<{ id: string } | null>({ id: 'a' });
  const listeners: Record<string, (data: any) => void> = {};
  const native = {
    addListener: vi.fn(async (name: string, callback: (data: any) => void) => {
      listeners[name] = callback; return { remove: vi.fn() };
    }),
    checkPermissions: vi.fn(async () => ({ display: 'granted' })),
    checkExactNotificationSetting: vi.fn(async () => ({ exact_alarm: 'denied' })),
    createChannel: vi.fn(async () => undefined),
    getPending: vi.fn(async (): Promise<{ notifications: any[] }> => ({ notifications: [] })),
    cancel: vi.fn(async () => undefined), cancelAll: vi.fn(async () => undefined),
    removeAllDeliveredNotifications: vi.fn(async () => undefined),
    schedule: vi.fn(async () => undefined),
  };
  const query: any = {};
  for (const method of ['select', 'eq', 'is', 'or', 'order']) query[method] = vi.fn(() => query);
  query.limit = vi.fn(async (): Promise<any> => ({ data: [], error: null }));
  const from = vi.fn(() => query);
  TestBed.configureTestingModule({ providers: [
    { provide: AuthStore, useValue: { user } },
    { provide: SUPABASE_CLIENT, useValue: { from } },
    { provide: NotificationSoundService, useValue: { enabled: signal(true) } },
    { provide: MOBILE_NOTIFICATION_PLUGIN, useValue: { plugin: native } },
  ] });
  const service = TestBed.inject(MobileNotificationsService);
  TestBed.tick();
  return { service, native, query, from, user, listeners };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.useRealTimers();
  localStorage.removeItem('workflow-android-alarm-owner');
});

describe('Android notification reconciliation', () => {
  it('keeps existing device alarms if the server query fails', async () => {
    const { service, native, query } = setup();
    query.limit.mockResolvedValue({ data: null, error: new Error('offline') });
    await vi.advanceTimersByTimeAsync(500);
    expect(native.cancel).not.toHaveBeenCalled();
    expect(native.cancelAll).not.toHaveBeenCalled();
    expect(native.schedule).not.toHaveBeenCalled();
    expect(service.error()).toContain('Chưa đồng bộ');
  });
  it('cancels removed reminders only after a successful authoritative response', async () => {
    const { native } = setup();
    native.getPending.mockResolvedValue({ notifications: [
      { id: 10, extra: { managedReminder: true, owner: 'a' } },
      { id: 11, extra: { owner: 'a' } },
    ] });
    await vi.advanceTimersByTimeAsync(500);
    expect(native.cancel).toHaveBeenCalledExactlyOnceWith({ notifications: [{ id: 10 }] });
  });
  it('never schedules an old account response after logout and clears native data', async () => {
    const { native, query, user, service } = setup();
    let resolve!: (data: any) => void;
    query.limit.mockReturnValue(new Promise((done) => { resolve = done; }));
    await vi.advanceTimersByTimeAsync(500);
    user.set(null); TestBed.tick();
    resolve({ data: [{ id: 'r1', remind_at: new Date(Date.now() + 60000).toISOString(),
      snoozed_until: null, seen_at: null,
      events: { id: 'e1', title: 'Private', start_at: new Date().toISOString(), deleted_at: null } }], error: null });
    await vi.advanceTimersByTimeAsync(500);
    expect(native.schedule).not.toHaveBeenCalled();
    expect(native.cancelAll).toHaveBeenCalledOnce();
    expect(native.removeAllDeliveredNotifications).toHaveBeenCalledOnce();
    expect(service.scheduled()).toBe(0);
  });
  it('does not query or silently request permissions when notifications are denied', async () => {
    const { native, from } = setup();
    native.checkPermissions.mockResolvedValue({ display: 'denied' });
    await vi.advanceTimersByTimeAsync(500);
    expect(from).not.toHaveBeenCalled();
    expect(native.schedule).not.toHaveBeenCalled();
  });
  it('rejects notification taps belonging to another account', async () => {
    const { service, listeners } = setup();
    await vi.advanceTimersByTimeAsync(0);
    const open = vi.fn(); service.onOpen = open;
    listeners['localNotificationActionPerformed']({ notification: {
      extra: { owner: 'b', alert: { id: 'private', eventId: 'e2' } },
    } });
    expect(open).not.toHaveBeenCalled();
  });
});
