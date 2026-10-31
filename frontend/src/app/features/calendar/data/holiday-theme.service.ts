import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { VietnamCalendarDayService } from '../../../core/services/vietnam-calendar-day.service';
import { findHolidayById, resolveTopHolidayForDate } from '../utils/holiday-resolver';
import { Holiday } from '../../../models/holiday-theme.model';
import { holidayPalette } from '../utils/holiday-palette';

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
  private readonly day = inject(VietnamCalendarDayService);

  readonly mode = signal<HolidayThemeMode>(readStoredMode() ?? 'auto');

  /** Set from the Settings "Developer" preview dropdown (dev builds only) */
  readonly debugOverrideId = signal<string | null>(null);
  readonly previewYear = signal(this.day.today().getFullYear());
  readonly previewing = computed(() => !!findHolidayById(this.debugOverrideId() ?? ''));
  private previewTimer?: ReturnType<typeof setTimeout>;

  readonly activeHoliday = computed<Holiday | null>(() => {
    const overrideId = this.debugOverrideId();
    if (overrideId) return findHolidayById(overrideId);
    if (this.mode() === 'off') return null;

    // Chỉ kích hoạt Theme Ngày Lễ khi HÔM NAY THỰC TẾ (real today) rơi vào ngày lễ.
    // Khi người dùng chuyển xem ngày/tháng khác trên lịch, giữ giao diện lịch sạch sẽ,
    // không tự động bật motif nền gây rối mắt.
    return resolveTopHolidayForDate(this.day.today());
  });

  readonly activeHolidayId = computed<string | null>(() => {
    return this.activeHoliday()?.id ?? null;
  });

  constructor() {
    effect(() => {
      const id = this.activeHolidayId();
      if (id) {
        document.documentElement.setAttribute('data-holiday', id);
        const palette = holidayPalette(this.activeHoliday()!);
        document.documentElement.style.setProperty('--holiday-fallback-light', palette.light);
        document.documentElement.style.setProperty('--holiday-fallback-dark', palette.dark);
      } else {
        document.documentElement.removeAttribute('data-holiday');
        document.documentElement.style.removeProperty('--holiday-fallback-light');
        document.documentElement.style.removeProperty('--holiday-fallback-dark');
      }
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.previewTimer);
      document.documentElement.removeAttribute('data-holiday');
      document.documentElement.style.removeProperty('--holiday-fallback-light');
      document.documentElement.style.removeProperty('--holiday-fallback-dark');
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
    this.clearPreview();
    this.mode.set(mode);
  }

  setDebugOverride(id: string | null): void {
    this.preview(id);
  }

  preview(id: string | null, year = this.day.today().getFullYear()): void {
    clearTimeout(this.previewTimer);
    const valid = id ? findHolidayById(id) : null;
    this.previewYear.set(Number.isInteger(year) ? year : this.day.today().getFullYear());
    this.debugOverrideId.set(valid?.id ?? null);
    if (valid) this.previewTimer = setTimeout(() => this.clearPreview(), 5 * 60_000);
  }

  clearPreview(): void {
    clearTimeout(this.previewTimer);
    this.debugOverrideId.set(null);
  }
}
