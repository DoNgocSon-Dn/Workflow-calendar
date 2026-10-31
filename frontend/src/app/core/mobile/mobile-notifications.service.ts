import { DestroyRef, Injectable, InjectionToken, effect, inject, signal, untracked } from '@angular/core';
import { LocalNotifications, LocalNotificationSchema } from '@capacitor/local-notifications';
import { AuthStore } from '../auth/auth-store';
import { SUPABASE_CLIENT } from '../supabase-client';
import { DesktopAlert } from '../desktop/desktop-bridge';
import { NotificationSoundService } from '../services/notification-sound.service';
import { isAndroidApp } from './mobile-platform';
import { MobileReminderRow, mobileNotificationId, planReminders } from './reminder-plan';

const CHANNEL = 'workflow-reminders-v1';
const QUIET_CHANNEL = 'workflow-quiet-v1';
const OWNER_KEY = 'workflow-android-alarm-owner';
export const MOBILE_NOTIFICATION_PLUGIN = new InjectionToken<{ plugin: typeof LocalNotifications }>(
  'MOBILE_NOTIFICATION_PLUGIN', { providedIn: 'root', factory: () => ({ plugin: LocalNotifications }) },
);

/** Native transport only: never depends on CalendarStore/NotificationService. */
@Injectable({ providedIn: 'root' })
export class MobileNotificationsService {
  private readonly native = inject(MOBILE_NOTIFICATION_PLUGIN).plugin;
  readonly supported = isAndroidApp();
  readonly permission = signal('prompt');
  readonly exact = signal(false);
  readonly scheduled = signal(0);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  private readonly auth = inject(AuthStore);
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly sound = inject(NotificationSoundService);
  private owner: string | null = null;
  private tail: Promise<void> = Promise.resolve();
  private channelReady?: Promise<void>;
  private readonly planned = new Map<string, number>();
  private readonly delivered = new Set<string>();
  private refreshTimer?: ReturnType<typeof setTimeout>;
  onOpen: ((alert: DesktopAlert) => void) | null = null;

  constructor() {
    if (!this.supported) return;
    effect(() => {
      const owner = this.auth.user()?.id ?? null;
      this.sound.enabled();
      untracked(() => {
        this.owner = owner;
        this.enqueue(async () => {
          if (owner !== this.auth.user()?.id && owner !== null) return;
          let previous: string | null = null;
          try { previous = localStorage.getItem(OWNER_KEY); } catch { /* optional */ }
          if (previous !== owner) {
            await this.native.cancelAll();
            await this.native.removeAllDeliveredNotifications();
            this.planned.clear();
            this.delivered.clear();
          }
          try {
            if (owner) localStorage.setItem(OWNER_KEY, owner);
            else localStorage.removeItem(OWNER_KEY);
          } catch { /* optional */ }
          if (!owner) this.scheduled.set(0);
        });
        this.refresh();
      });
    });
    const destroy = inject(DestroyRef);
    void this.native.addListener('localNotificationReceived', (notification) => {
      if (notification.extra?.owner === this.auth.user()?.id && notification.extra?.alert?.id) {
        this.delivered.add(`${notification.extra.owner}:${notification.extra.alert.id}`);
      }
    }).then((listener) => destroy.onDestroy(() => void listener.remove())).catch(() => undefined);
    void this.native.addListener('localNotificationActionPerformed', ({ notification }) => {
      const extra = notification.extra;
      if (!extra || extra.owner !== this.auth.user()?.id) return;
      if (typeof extra.alert?.id === 'string') this.onOpen?.(extra.alert);
    }).then((listener) => {
      destroy.onDestroy(() => void listener.remove());
    }).catch(() => undefined);
    const timer = setInterval(() => { if (!document.hidden) this.refresh(); }, 300000);
    destroy.onDestroy(() => { clearInterval(timer); clearTimeout(this.refreshTimer); });
  }

  private enqueue(work: () => Promise<void>): void {
    this.tail = this.tail.then(work).catch(() => {
      this.error.set('Chưa đồng bộ được nhắc lịch trên điện thoại. Hãy thử lại khi có mạng.');
    });
  }

  private channels(): Promise<void> {
    return this.channelReady ??= Promise.all([
      this.native.createChannel({ id: CHANNEL, name: 'Nhắc lịch và tin nhắn',
        description: 'Thông báo nổi, có âm thanh và rung', importance: 5, visibility: 0,
        sound: 'workflow_reminder.mp3', vibration: true, lights: true }),
      this.native.createChannel({ id: QUIET_CHANNEL, name: 'Thông báo im lặng',
        importance: 3, visibility: 0, vibration: false, sound: '' }),
    ]).then(() => undefined).catch((error) => { this.channelReady = undefined; throw error; });
  }

  async checkPermission(): Promise<void> {
    if (!this.supported) return;
    const [permission, exact] = await Promise.all([
      this.native.checkPermissions(), this.native.checkExactNotificationSetting(),
    ]);
    this.permission.set(permission.display);
    this.exact.set(exact.exact_alarm === 'granted');
  }

  async enable(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.channels();
      const result = await this.native.requestPermissions();
      this.permission.set(result.display);
      if (result.display !== 'granted') {
        this.error.set('Bạn cần bật quyền Thông báo trong cài đặt ứng dụng trên điện thoại.');
      } else this.refresh();
    } catch { this.error.set('Không mở được quyền thông báo. Hãy thử lại.'); }
    finally { this.busy.set(false); }
  }

  async enableExact(): Promise<void> {
    try {
      await this.native.changeExactNotificationSetting();
      await this.checkPermission();
      this.refresh();
    } catch { this.error.set('Hãy kiểm tra mục Báo thức và lời nhắc trong cài đặt Android.'); }
  }

  refresh(): void {
    if (!this.supported) return;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.sync(), 400);
  }

  private sync(): void {
    const owner = this.auth.user()?.id;
    this.enqueue(async () => {
      if (!owner || owner !== this.auth.user()?.id) return;
      await this.checkPermission();
      if (this.permission() !== 'granted') return;
      const now = Date.now();
      const from = new Date(now).toISOString();
      const to = new Date(now + 30 * 86400000).toISOString();
      // Uses the signed-in user's Supabase client and RLS, never a service key.
      const { data, error } = await this.supabase.from('reminders')
        .select('id,remind_at,snoozed_until,seen_at,events!inner(id,title,start_at,deleted_at)')
        .eq('user_id', owner).eq('remind_type', 'popup').is('seen_at', null)
        .is('events.deleted_at', null)
        .or(`and(remind_at.gt.${from},remind_at.lte.${to}),and(snoozed_until.gt.${from},snoozed_until.lte.${to})`)
        .order('remind_at').limit(501);
      if (error) throw error; // Keep existing alarms if the network/query fails.
      if (owner !== this.auth.user()?.id) return;
      const plan = planReminders(owner, (data ?? []) as unknown as MobileReminderRow[], now);
      await this.channels();
      const { notifications } = await this.native.getPending();
      const desired = new Set(plan.map((item) => item.id));
      const obsolete = notifications.filter((n) => n.extra?.managedReminder && !desired.has(n.id));
      if (obsolete.length) await this.native.cancel({ notifications: obsolete.map(({ id }) => ({ id })) });
      if (owner !== this.auth.user()?.id) return;
      const pending = new Map(notifications.filter((n) => n.extra?.owner === owner).map((n) => [n.id, n]));
      const changed: LocalNotificationSchema[] = [];
      this.planned.clear();
      for (const item of plan) {
        const key = `reminder-${item.reminderId}`;
        this.planned.set(key, item.at);
        const channelId = this.sound.enabled() ? CHANNEL : QUIET_CHANNEL;
        const old = pending.get(item.id);
        if (old?.extra?.at === item.at && old.extra.channelId === channelId &&
            old.extra.exact === this.exact() && old.title === item.title) continue;
        const alert: DesktopAlert = { id: key, title: item.title, body: item.body,
          kind: 'reminder', eventId: item.eventId };
        changed.push({ id: item.id, title: item.title, body: item.body, channelId,
          schedule: { at: new Date(item.at), allowWhileIdle: true },
          isExactNotification: this.exact(), foreground: true, autoCancel: true,
          extra: { owner, alert, managedReminder: true, at: item.at, channelId, exact: this.exact() } });
      }
      if (changed.length) await this.native.schedule({ notifications: changed });
      this.scheduled.set(plan.length);
      this.error.set((data?.length ?? 0) > 128
        ? 'Đang giữ tối đa 128 lời nhắc gần nhất trong 30 ngày; mở app thường xuyên để cập nhật.' : null);
    });
  }

  notify(alert: DesktopAlert): void {
    if (!this.supported || !this.owner) return;
    const owner = this.owner;
    const key = `${owner}:${alert.id}`;
    const plannedAt = this.planned.get(alert.id);
    // The device alarm and realtime server event may arrive together.
    if (this.delivered.has(key) || (plannedAt && Math.abs(Date.now() - plannedAt) < 120000)) return;
    this.delivered.add(key);
    if (this.delivered.size > 256) this.delivered.delete(this.delivered.values().next().value!);
    this.enqueue(async () => {
      if (this.auth.user()?.id !== owner) return;
      await this.checkPermission();
      if (this.permission() !== 'granted') return;
      await this.channels();
      await this.native.schedule({ notifications: [{
        id: mobileNotificationId(owner, alert.id), title: alert.title.slice(0, 160),
        body: alert.body.slice(0, 1000), channelId: alert.sound === false ? QUIET_CHANNEL : CHANNEL,
        foreground: true, autoCancel: true, isExactNotification: false, extra: { owner, alert },
      }] });
    });
  }

  async test(): Promise<void> {
    await this.enable();
    if (this.permission() !== 'granted') return;
    const owner = this.auth.user()?.id;
    if (!owner) return;
    try {
      await this.native.schedule({ notifications: [{
        id: mobileNotificationId(owner, 'test'), title: 'Workflow Calendar',
        body: 'Thông báo thử đã hoạt động. Bạn có thể quay lại lịch.', channelId: CHANNEL,
        schedule: { at: new Date(Date.now() + 10000), allowWhileIdle: true },
        isExactNotification: this.exact(), foreground: true, autoCancel: true,
        extra: { owner, alert: { id: 'android-test', title: 'Workflow Calendar', body: '', kind: 'test' } },
      }] });
      this.error.set('Đã hẹn thông báo thử sau 10 giây. Bạn có thể đưa app về nền để kiểm tra.');
    } catch { this.error.set('Chưa hẹn được thông báo thử. Hãy kiểm tra quyền thông báo.'); }
  }
}
