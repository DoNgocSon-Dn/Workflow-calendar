import { Injectable, inject, signal } from '@angular/core';
import { AuthStore } from '../auth/auth-store';
import { SUPABASE_CLIENT } from '../supabase-client';
import { NotificationSoundService } from './notification-sound.service';
import { Clock } from '../clock';
import { todayInVietnam } from '../utils/vietnam-time';

export interface CompanionDuration {
  readonly years: number;
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly formattedString: string;
}

export function computeCompanionDuration(startDate: Date, endDate: Date): CompanionDuration {
  const diffMs = Math.max(0, endDate.getTime() - startDate.getTime());
  const totalSec = Math.floor(diffMs / 1000);

  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const totalHours = Math.floor(totalMin / 60);
  const hours = totalHours % 24;
  const totalDays = Math.floor(totalHours / 24);
  const years = Math.floor(totalDays / 365);
  const days = totalDays % 365;

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} năm`);
  if (days > 0 || years > 0) parts.push(`${days} ngày`);
  parts.push(`${hours} giờ`);
  parts.push(`${min} phút`);
  parts.push(`${sec} giây`);

  return {
    years,
    days,
    hours,
    minutes: min,
    seconds: sec,
    formattedString: parts.join(' '),
  };
}

export interface BirthdayPopupData {
  readonly userName: string;
  readonly dateOfBirth: string; // YYYY-MM-DD or MM-DD
  readonly accountCreatedAt: Date;
  readonly isPreview: boolean;
}

export interface BirthdayWishRecord {
  readonly id: string;
  readonly wishYear: number;
  readonly wishText: string;
  readonly status: 'pending' | 'completed' | 'in_progress' | 'retry';
  readonly createdAt: string;
}

const DOB_STORAGE_KEY = 'workflow_user_dob';
const DO_NOT_SHOW_YEARLY_KEY = 'workflow_birthday_disabled_year_';

@Injectable({ providedIn: 'root' })
export class BirthdayPopupService {
  private readonly authStore = inject(AuthStore);
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly sound = inject(NotificationSoundService);
  private readonly clock = inject(Clock);

  readonly visible = signal<boolean>(false);
  readonly data = signal<BirthdayPopupData | null>(null);
  readonly pendingReviewWish = signal<BirthdayWishRecord | null>(null);

  /** Kiểm tra xem chúc mừng sinh nhật năm nay có bị chọn "Không hiển thị lại" hay đã hoàn thành */
  isBirthdayDisabledForCurrentYear(): boolean {
    const now = todayInVietnam(this.clock.now());
    const yearKey = `${DO_NOT_SHOW_YEARLY_KEY}${now.getFullYear()}`;
    return localStorage.getItem(yearKey) === 'true';
  }

  /** Đánh dấu không hiển thị lại chúc mừng sinh nhật cho năm hiện tại */
  disableForCurrentYear(): void {
    const now = todayInVietnam(this.clock.now());
    const yearKey = `${DO_NOT_SHOW_YEARLY_KEY}${now.getFullYear()}`;
    localStorage.setItem(yearKey, 'true');
  }

  /** Bật lại hiển thị chúc mừng sinh nhật cho năm hiện tại */
  enableForCurrentYear(): void {
    const now = todayInVietnam(this.clock.now());
    const yearKey = `${DO_NOT_SHOW_YEARLY_KEY}${now.getFullYear()}`;
    localStorage.removeItem(yearKey);
  }

  /**
   * Tự động trích xuất ngày sinh từ tài khoản Google OAuth / Supabase metadata / LocalStorage
   */
  getUserDob(): string {
    const local = localStorage.getItem(DOB_STORAGE_KEY);
    if (local && local.trim()) return local.trim();

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
   * Trích xuất ngày tạo tài khoản từ Auth Store
   */
  getAccountCreatedAt(): Date {
    const user = this.authStore.user();
    if (user?.created_at) {
      const d = new Date(user.created_at);
      if (!isNaN(d.getTime())) return d;
    }
    // Mặc định 1 năm 3 ngày trước nếu không tìm thấy
    const now = this.clock.now();
    return new Date(now.getTime() - (368 * 86400 * 1000 + 7320 * 1000));
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

  async checkPendingWishForReview(): Promise<BirthdayWishRecord | null> {
    const user = this.authStore.user();
    const currentYear = todayInVietnam(this.clock.now()).getFullYear();

    const localPastWish = localStorage.getItem(`workflow_wish_${currentYear - 1}`);
    const localPastStatus = localStorage.getItem(`workflow_wish_status_${currentYear - 1}`);

    if (user) {
      try {
        const { data, error } = await this.supabase.rpc('get_pending_wish_for_review', {
          p_current_year: currentYear,
        });
        if (!error && data && data.length > 0) {
          const item = data[0];
          const record: BirthdayWishRecord = {
            id: item.id,
            wishYear: item.wish_year,
            wishText: item.wish_text,
            status: item.status,
            createdAt: item.created_at,
          };
          this.pendingReviewWish.set(record);
          return record;
        }
      } catch (e) {
        console.warn('Không thể tải điều ước cũ từ Supabase:', e);
      }
    }

    if (localPastWish && localPastStatus !== 'reviewed') {
      const record: BirthdayWishRecord = {
        id: `local-${currentYear - 1}`,
        wishYear: currentYear - 1,
        wishText: localPastWish,
        status: 'pending',
        createdAt: `${currentYear - 1}-01-01`,
      };
      this.pendingReviewWish.set(record);
      return record;
    }

    this.pendingReviewWish.set(null);
    return null;
  }

  async saveCurrentYearWish(wishText: string): Promise<boolean> {
    const cleaned = wishText.trim();
    if (!cleaned) return false;

    const currentYear = todayInVietnam(this.clock.now()).getFullYear();
    localStorage.setItem(`workflow_wish_${currentYear}`, cleaned);
    this.disableForCurrentYear();

    const user = this.authStore.user();
    if (user) {
      try {
        await this.supabase.from('birthday_wishes').upsert(
          {
            user_id: user.id,
            wish_year: currentYear,
            wish_text: cleaned,
            status: 'pending',
            created_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,wish_year' },
        );
      } catch (e) {
        console.warn('Không thể lưu điều ước lên Supabase:', e);
      }
    }
    return true;
  }

  async reviewPastWish(wishId: string, status: 'completed' | 'in_progress' | 'retry'): Promise<void> {
    const currentYear = todayInVietnam(this.clock.now()).getFullYear();
    localStorage.setItem(`workflow_wish_status_${currentYear - 1}`, 'reviewed');
    this.pendingReviewWish.set(null);

    const user = this.authStore.user();
    if (user && wishId && !wishId.startsWith('local-')) {
      try {
        await this.supabase
          .from('birthday_wishes')
          .update({
            status,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', wishId);
      } catch (e) {
        console.warn('Không thể cập nhật trạng thái điều ước:', e);
      }
    }
  }

  checkAndTriggerBirthday(): void {
    if (this.visible()) return;

    const dob = this.getUserDob();
    if (!dob) return;

    const parsed = this.parseDob(dob);
    if (!parsed) return;

    if (this.isBirthdayDisabledForCurrentYear() && !this.clock.devOverride()) {
      return;
    }

    const now = todayInVietnam(this.clock.now());
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    if (parsed.month === currentMonth && parsed.day === currentDay) {
      void this.checkPendingWishForReview();
      this.triggerBirthday(dob, false);
    }
  }

  triggerBirthday(dob?: string, isPreview = false): void {
    if (this.visible()) return;

    const finalDob = dob || this.getUserDob() || '2000-01-01';
    const userName = this.authStore.displayName() || this.authStore.user()?.email?.split('@')[0] || 'bạn';
    const accountCreatedAt = this.getAccountCreatedAt();

    void this.checkPendingWishForReview();

    this.data.set({
      userName,
      dateOfBirth: finalDob,
      accountCreatedAt,
      isPreview,
    });
    this.visible.set(true);
    this.sound.notifyKind('birthday');
  }

  dismiss(): void {
    this.visible.set(false);
  }
}
