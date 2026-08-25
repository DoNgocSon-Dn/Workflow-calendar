import { Injectable, inject, signal } from '@angular/core';
import { AuthStore } from '../auth/auth-store';
import { SUPABASE_CLIENT } from '../supabase-client';

export interface BirthdayPopupData {
  readonly userName: string;
  readonly dateOfBirth: string; // YYYY-MM-DD or MM-DD
  readonly isPreview: boolean;
}

const DOB_STORAGE_KEY = 'workflow_user_dob';
const SHOWN_PREFIX = 'workflow_birthday_shown_';

@Injectable({ providedIn: 'root' })
export class BirthdayPopupService {
  private readonly authStore = inject(AuthStore);
  private readonly supabase = inject(SUPABASE_CLIENT);

  readonly visible = signal<boolean>(false);
  readonly data = signal<BirthdayPopupData | null>(null);

  /**
   * Lấy ngày sinh của người dùng (từ Supabase metadata hoặc LocalStorage)
   */
  getUserDob(): string {
    const user = this.authStore.user();
    const metadata = user?.user_metadata as Record<string, unknown> | undefined;
    const metaDob = typeof metadata?.['date_of_birth'] === 'string' ? metadata['date_of_birth'] : null;
    if (metaDob) return metaDob;

    return localStorage.getItem(DOB_STORAGE_KEY) || '';
  }

  /**
   * Lưu ngày sinh người dùng vào Supabase user_metadata và LocalStorage
   */
  async setUserDob(dob: string): Promise<void> {
    const cleaned = dob.trim();
    localStorage.setItem(DOB_STORAGE_KEY, cleaned);

    if (this.authStore.user()) {
      try {
        await this.supabase.auth.updateUser({
          data: { date_of_birth: cleaned },
        });
      } catch (err) {
        console.warn('Không thể cập nhật ngày sinh lên Supabase auth metadata:', err);
      }
    }
  }

  /**
   * Kiểm tra xem hôm nay có phải sinh nhật người dùng hay không và kích hoạt hiển thị
   */
  checkAndTriggerBirthday(): void {
    const dob = this.getUserDob();
    if (!dob) return;

    const parts = dob.split('-');
    if (parts.length < 2) return;

    const birthMonth = parseInt(parts[parts.length - 2], 10);
    const birthDay = parseInt(parts[parts.length - 1], 10);

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    if (birthMonth === currentMonth && birthDay === currentDay) {
      const todayKey = `${SHOWN_PREFIX}${now.getFullYear()}-${currentMonth}-${currentDay}`;
      const alreadyShown = localStorage.getItem(todayKey);

      if (!alreadyShown) {
        this.triggerBirthday(dob, false);
      }
    }
  }

  /**
   * Mở màn hình chúc mừng sinh nhật (có cờ `isPreview` nếu bấm xem thử từ Cài đặt)
   */
  triggerBirthday(dob?: string, isPreview = false): void {
    const finalDob = dob || this.getUserDob() || '2000-01-01';
    const userName = this.authStore.displayName() || this.authStore.user()?.email?.split('@')[0] || 'bạn';

    this.data.set({
      userName,
      dateOfBirth: finalDob,
      isPreview,
    });
    this.visible.set(true);

    if (!isPreview) {
      const now = new Date();
      const todayKey = `${SHOWN_PREFIX}${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      localStorage.setItem(todayKey, 'true');
    }
  }

  dismiss(): void {
    this.visible.set(false);
  }
}
