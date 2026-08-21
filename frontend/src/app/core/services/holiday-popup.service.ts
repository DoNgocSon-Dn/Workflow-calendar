import { Injectable, computed, signal } from '@angular/core';
import { HOLIDAY_THEMES } from '../../data/holidays.data';
import { HolidayTheme, ResolvedHoliday } from '../../models/holiday-theme.model';
import { dateKey, resolveActiveHoliday } from './holiday-resolver';

const STORAGE_PREFIX = 'holiday-popup:dismissed:';

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function dismissedKey(holidayId: string, date: Date): string {
  return `${STORAGE_PREFIX}${holidayId}:${dateKey(date)}`;
}

/**
 * Cho phép xem trước 1 theme bất kỳ qua URL, vd. `?holiday=christmas`, để
 * QA/demo không phải đợi đúng ngày lễ. Chỉ đọc query string, không lưu lại
 * và không ảnh hưởng logic chọn ngày lễ mặc định.
 */
function getPreviewHolidayId(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('holiday');
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class HolidayPopupService {
  private readonly today = new Date();
  // Tăng lên sau mỗi lần dismiss() để buộc `resolved` tính lại và ẩn popup.
  private readonly dismissTick = signal(0);
  // Đặt khi người dùng chủ động bấm vào 1 sự kiện ngày lễ trên lịch — ưu tiên
  // cao nhất, bỏ qua trạng thái "đã đóng hôm nay" vì đây là hành động tra
  // cứu chủ động, không phải popup tự động.
  private readonly manualHoliday = signal<HolidayTheme | null>(null);

  readonly resolved = computed<ResolvedHoliday | null>(() => {
    this.dismissTick();

    const manual = this.manualHoliday();
    if (manual) {
      return { theme: manual, content: manual.getContent({ date: this.today }) };
    }

    const previewId = getPreviewHolidayId();
    const previewTheme = previewId ? HOLIDAY_THEMES.find((t) => t.id === previewId) : undefined;
    if (previewTheme) {
      return { theme: previewTheme, content: previewTheme.getContent({ date: this.today }) };
    }

    const theme = resolveActiveHoliday(this.today, HOLIDAY_THEMES);
    if (!theme) return null;
    if (this.isDismissed(theme.id)) return null;

    return { theme, content: theme.getContent({ date: this.today }) };
  });

  /** Hiện popup cho 1 theme cụ thể ngay lập tức, vd. khi bấm vào sự kiện ngày lễ trên lịch. */
  showHoliday(themeId: string): void {
    const theme = HOLIDAY_THEMES.find((t) => t.id === themeId);
    if (theme) this.manualHoliday.set(theme);
  }

  dismiss(): void {
    if (this.manualHoliday()) {
      this.manualHoliday.set(null);
      return;
    }

    const current = this.resolved();
    if (!current) return;

    const storage = safeLocalStorage();
    try {
      storage?.setItem(dismissedKey(current.theme.id, this.today), '1');
    } catch {
      // Storage đầy hoặc bị chặn (chế độ ẩn danh) — bỏ qua, popup vẫn đóng
      // được trong phiên hiện tại nhờ dismissTick, chỉ không nhớ qua lần tải lại.
    }
    this.dismissTick.update((tick) => tick + 1);
  }

  private isDismissed(holidayId: string): boolean {
    const storage = safeLocalStorage();
    if (!storage) return false;
    try {
      return storage.getItem(dismissedKey(holidayId, this.today)) === '1';
    } catch {
      return false;
    }
  }
}
