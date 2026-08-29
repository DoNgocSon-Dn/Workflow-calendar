import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { CalendarStore } from './calendar-store';
import { findHolidayById, resolveTopHolidayForDate } from '../utils/holiday-resolver';
import { Holiday } from '../../../models/holiday-theme.model';

export type HolidayThemeMode = 'auto' | 'off';

const STORAGE_KEY = 'holiday-theme-mode';
const VALID_MODES: readonly HolidayThemeMode[] = ['auto', 'off'];

function isHolidayThemeMode(value: string | null): value is HolidayThemeMode {
  return value !== null && (VALID_MODES as readonly string[]).includes(value);
}

function readStoredMode(): HolidayThemeMode | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isHolidayThemeMode(stored) ? stored : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class HolidayThemeService {
  private readonly store = inject(CalendarStore);

  readonly mode = signal<HolidayThemeMode>(readStoredMode() ?? 'auto');

  /** Set from the Settings "Developer" preview dropdown (dev builds only) */
  readonly debugOverrideId = signal<string | null>(null);

  readonly activeHoliday = computed<Holiday | null>(() => {
    if (this.mode() === 'off') return null;
    const overrideId = this.debugOverrideId();
    if (overrideId) return findHolidayById(overrideId);

    // Chỉ kích hoạt Theme Ngày Lễ khi HÔM NAY THỰC TẾ (real today) rơi vào ngày lễ.
    // Khi người dùng chuyển xem ngày/tháng khác trên lịch, giữ giao diện lịch sạch sẽ,
    // không tự động bật motif nền gây rối mắt.
    return resolveTopHolidayForDate(this.store.today());
  });

  readonly activeHolidayId = computed<string | null>(() => {
    return this.activeHoliday()?.id ?? null;
  });

  constructor() {
    effect(() => {
      const id = this.activeHolidayId();
      if (id) {
        document.documentElement.setAttribute('data-holiday', id);
      } else {
        document.documentElement.removeAttribute('data-holiday');
      }
    });

    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, this.mode());
      } catch {
        // Private browsing localStorage fallback
      }
    });
  }

  setMode(mode: HolidayThemeMode): void {
    this.mode.set(mode);
  }

  setDebugOverride(id: string | null): void {
    this.debugOverrideId.set(id);
  }
}
