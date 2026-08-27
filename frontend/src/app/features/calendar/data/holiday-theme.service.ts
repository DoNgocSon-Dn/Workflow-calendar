import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { CalendarStore } from './calendar-store';
import { findHolidayById, resolveTopHolidayForDate } from '../utils/holiday-resolver';
import { Holiday } from '../../../models/holiday-theme.model';

/**
 * Layers a "holiday theme" on top of the existing light/dark + brand-accent
 * system, following the exact same shape as `ThemeService`/`BrandThemeService`
 * (one signal, one constructor `effect()` writing both the DOM and
 * localStorage) — see `core/theme/`. Lives here rather than under
 * `core/theme/` because it depends on `CalendarStore.focusedDate` (the
 * *viewed* date, not just real "today" — spec requirement: previewing a
 * holiday by navigating the calendar to it, without waiting for the real
 * date), and `core/` doesn't depend on feature stores in this codebase.
 */
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

  /** Set from the Settings "Developer" preview dropdown (dev builds only) —
   *  takes precedence over the computed value so a holiday can be previewed
   *  without navigating the calendar to the right date. `null` = no override. */
  readonly debugOverrideId = signal<string | null>(null);

  readonly activeHoliday = computed<Holiday | null>(() => {
    if (this.mode() === 'off') return null;
    const overrideId = this.debugOverrideId();
    if (overrideId) return findHolidayById(overrideId);

    // 1. Ưu tiên HÔM NAY THỰC TẾ (real today): Nếu hôm nay thực tế rơi vào ngày lễ,
    //    giữ nguyên theme & animation ngày lễ đó suốt cả ngày cho đến khi qua ngày mới (midnight tick).
    //    Không bị mất hay đổi theme chỉ vì người dùng nhấp chọn ô ngày khác trên lịch.
    const todayHoliday = resolveTopHolidayForDate(this.store.today());
    if (todayHoliday) return todayHoliday;

    // 2. Nếu hôm nay thực tế không phải ngày lễ, nhưng người dùng xem/chọn một ngày lễ trên lịch -> preview theme đó
    return resolveTopHolidayForDate(this.store.focusedDate());
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
        // Chế độ riêng tư chặn localStorage — vẫn chạy, chỉ không nhớ lựa chọn.
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
