import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthStore } from '../auth/auth-store';

const STORAGE_KEY = 'push-notifications';
const SW_URL = '/sw.js';

function readStoredEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Khoá VAPID base64url → Uint8Array cho PushManager.subscribe. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Web Push cho nhắc lịch khi app đã đóng. Opt-in: mặc định tắt vì cần quyền
 * thông báo của hệ điều hành. Khi bật, đăng ký service worker + subscription và
 * gửi lên backend; backend đẩy push trong cron nhắc lịch.
 */
@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private readonly http = inject(HttpClient);
  private readonly authStore = inject(AuthStore);
  private readonly apiUrl = environment.apiUrl;

  readonly enabled = signal<boolean>(readStoredEnabled());
  readonly permission = signal<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  /** Trình duyệt có đủ API + đã cấu hình VAPID key không. */
  readonly supported = computed(
    () =>
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      typeof window !== 'undefined' &&
      'PushManager' in window &&
      !!environment.vapidPublicKey,
  );

  constructor() {
    effect(() => {
      const token = this.authStore.accessToken();
      // Đã bật + đã đăng nhập + đã có quyền ⇒ đảm bảo subscription còn sống
      // (đổi máy, SW cập nhật, subscription hết hạn đều cần đăng ký lại).
      if (token && this.enabled() && this.permission() === 'granted' && this.supported()) {
        void this.resubscribe();
      }
    });
  }

  /** Người dùng bật công tắc: xin quyền, đăng ký, lưu lựa chọn. */
  async enable(): Promise<boolean> {
    if (!this.supported()) {
      this.error.set('unsupported');
      return false;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const perm = await Notification.requestPermission();
      this.permission.set(perm);
      if (perm !== 'granted') {
        this.error.set('denied');
        return false;
      }
      await this.resubscribe();
      this.enabled.set(true);
      this.persist(true);
      return true;
    } catch (err) {
      this.error.set((err as Error).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /** Tắt công tắt: huỷ subscription cả ở trình duyệt lẫn backend. */
  async disable(): Promise<void> {
    this.busy.set(true);
    try {
      const reg = await navigator.serviceWorker?.getRegistration(SW_URL);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await this.deleteOnServer(sub.endpoint);
        await sub.unsubscribe().catch(() => undefined);
      }
    } finally {
      this.enabled.set(false);
      this.persist(false);
      this.busy.set(false);
    }
  }

  toggle(): void {
    void (this.enabled() ? this.disable() : this.enable());
  }

  private persist(on: boolean): void {
    try {
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch {
      /* bỏ qua */
    }
  }

  private async resubscribe(): Promise<void> {
    const reg =
      (await navigator.serviceWorker.getRegistration(SW_URL)) ??
      (await navigator.serviceWorker.register(SW_URL));
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(environment.vapidPublicKey),
      });
    }
    await this.sendToServer(sub);
  }

  private async sendToServer(sub: PushSubscription): Promise<void> {
    const json = sub.toJSON();
    await firstValueFrom(
      this.http.post<void>(`${this.apiUrl}/push/subscribe`, {
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys?.['p256dh'], auth: json.keys?.['auth'] },
      }),
    );
  }

  private async deleteOnServer(endpoint: string): Promise<void> {
    await firstValueFrom(
      this.http.request<void>('delete', `${this.apiUrl}/push/subscribe`, { body: { endpoint } }),
    ).catch(() => undefined);
  }
}
