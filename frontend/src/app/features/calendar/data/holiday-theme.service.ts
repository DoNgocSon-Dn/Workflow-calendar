import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { CalendarStore } from './calendar-store';
import { resolveTopHolidayForDate } from '../utils/holiday-resolver';

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

  readonly activeHolidayId = computed<string | null>(() => {
    if (this.mode() === 'off') return null;
    const override = this.debugOverrideId();
    if (override) return override;
    return resolveTopHolidayForDate(this.store.focusedDate())?.id ?? null;
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
