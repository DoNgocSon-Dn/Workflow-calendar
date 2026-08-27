import { Injectable, inject, signal } from '@angular/core';
import { AuthStore } from '../auth/auth-store';
import { SUPABASE_CLIENT } from '../supabase-client';
import { NotificationSoundService } from './notification-sound.service';
import { Clock } from '../clock';
import { todayInVietnam } from '../utils/vietnam-time';

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
  private readonly sound = inject(NotificationSoundService);
  private readonly clock = inject(Clock);

  readonly visible = signal<boolean>(false);
  readonly data = signal<BirthdayPopupData | null>(null);

  /**
   * Tự động trích xuất ngày sinh từ tài khoản Google OAuth / Supabase metadata / LocalStorage
   */
  getUserDob(): string {
    // 1. Nếu người dùng đã thiết lập hoặc lưu từ trước
    const local = localStorage.getItem(DOB_STORAGE_KEY);
    if (local && local.trim()) return local.trim();

    // 2. Trích xuất từ metadata đăng nhập Google / Supabase Auth
    const user = this.authStore.user();
    if (user) {
      const metadata = (user.user_metadata || {}) as Record<string, any>;
      const identityData = (user.identities?.[0]?.identity_data || {}) as Record<string, any>;

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

    return '';
  }

  /**
   * Trích xuất tháng và ngày từ chuỗi ngày sinh linh hoạt
   */
  parseDob(dob: string): { month: number; day: number } | null {
    if (!dob) return null;
    const parts = dob.trim().split(/[-/]/);
    if (parts.length < 2) return null;

    let month = 0;
    let day = 0;

    if (parts.length === 3) {
      if (parts[0].length === 4) {
        month = parseInt(parts[1], 10);
        day = parseInt(parts[2], 10);
      } else {
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
      }
    } else if (parts.length === 2) {
      month = parseInt(parts[0], 10);
      day = parseInt(parts[1], 10);
      if (month > 12) {
        const tmp = month;
        month = day;
        day = tmp;
      }
    }

    if (!isNaN(month) && !isNaN(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { month, day };
    }
    return null;
  }

  /**
   * Trả về định dạng hiển thị ngày sinh kiểu Việt Nam (VD: 15/05/2000 hoặc 15/05)
   */
  getFormattedDobDisplay(): string {
    const raw = this.getUserDob();
    if (!raw) return '';
    const parsed = this.parseDob(raw);
    if (parsed) {
      const mStr = String(parsed.month).padStart(2, '0');
      const dStr = String(parsed.day).padStart(2, '0');
      return `${dStr}/${mStr}`;
    }
    return raw;
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
   * Kiểm tra xem hôm nay (hoặc ngày đang giả lập bằng Clock) có phải sinh nhật hay không
   */
  checkAndTriggerBirthday(): void {
    const dob = this.getUserDob();
    if (!dob) return;

    const parsed = this.parseDob(dob);
    if (!parsed) return;

    // Dùng Clock.now() (hỗ trợ giả lập ngày) thay vì new Date() cứng của máy
    const now = todayInVietnam(this.clock.now());
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    if (parsed.month === currentMonth && parsed.day === currentDay) {
      const todayKey = `${SHOWN_PREFIX}${now.getFullYear()}-${currentMonth}-${currentDay}`;
      const alreadyShown = localStorage.getItem(todayKey);

      // Nếu đang bật giả lập ngày (devOverride) hoặc chưa hiển thị popup hôm nay -> mở popup sinh nhật
      if (!alreadyShown || !!this.clock.devOverride()) {
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
    this.sound.notifyKind('birthday');

    if (!isPreview && !this.clock.devOverride()) {
      const now = todayInVietnam(this.clock.now());
      const todayKey = `${SHOWN_PREFIX}${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      localStorage.setItem(todayKey, 'true');
    }
  }

  dismiss(): void {
    this.visible.set(false);
  }
}

