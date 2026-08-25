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
   * Tự động trích xuất ngày sinh từ tài khoản Google OAuth / Supabase metadata / LocalStorage
   */
  getUserDob(): string {
    const user = this.authStore.user();
    if (user) {
      const metadata = (user.user_metadata || {}) as Record<string, any>;
      const identityData = (user.identities?.[0]?.identity_data || {}) as Record<string, any>;

      // 1. Thử đọc từ các trường metadata chuẩn của Google & Supabase
      const possibleDob =
        metadata['date_of_birth'] ||
        metadata['birthday'] ||
        metadata['dob'] ||
        identityData['date_of_birth'] ||
        identityData['birthday'] ||
        identityData['dob'];

      if (typeof possibleDob === 'string' && possibleDob.trim()) {
        return possibleDob.trim();
      }

      // 2. Thử đọc từ mảng birthdays của Google People API
      const birthdaysArr = metadata['birthdays'] || identityData['birthdays'];
      if (Array.isArray(birthdaysArr) && birthdaysArr.length > 0) {
        const bDate = birthdaysArr[0]?.date;
        if (bDate && bDate.month && bDate.day) {
          const y = bDate.year || 2000;
          const m = String(bDate.month).padStart(2, '0');
          const d = String(bDate.day).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
      }
    }

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
