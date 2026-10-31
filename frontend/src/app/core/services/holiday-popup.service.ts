import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Holiday } from '../../models/holiday-theme.model';
import { resolveHolidaysForDate, resolveOccurrenceDatesForYear } from '../../features/calendar/utils/holiday-resolver';
import { VietnamCalendarDayService } from './vietnam-calendar-day.service';
import { NotificationSoundService } from './notification-sound.service';
import { HolidayThemeService } from '../../features/calendar/data/holiday-theme.service';

const DISMISS_KEY_PREFIX = 'holiday-popup-dismissed:';
const NOTIFICATIONS_ENABLED_KEY = 'holiday-notifications-enabled';

function readStoredNotificationsEnabled(): boolean {
  if (!isBrowserStorageAvailable()) return true;
  try {
    return window.localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) !== '0';
  } catch {
    return true;
  }
}

function isBrowserStorageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    // Accessing window/localStorage can throw in locked-down environments
    // (e.g. sandboxed iframes) — treat that the same as "not available".
    return false;
  }
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveActivePopupHoliday(today: Date): Holiday | null {
  return resolveHolidaysForDate(today).find((h) => h.popupEnabled) ?? null;
}

/**
 * Resolves which holiday (if any) is active today, and whether its popup
 * should currently be visible. Only holidays with `popupEnabled: true` are
 * candidates — most holidays only get a calendar badge/theme, not a popup.
 * Dismissal is remembered per holiday/year, so Tết's five-day window does
 * not interrupt the user every day. A manual preview can always reopen a
 * greeting without changing the automatic preference or system clock.
 */
@Injectable({ providedIn: 'root' })
export class HolidayPopupService {
  private readonly day = inject(VietnamCalendarDayService);
  private readonly sound = inject(NotificationSoundService);
  private readonly holidayThemeService = inject(HolidayThemeService);

  /** Theo giờ VN, cập nhật lại quanh nửa đêm — không phải giá trị tính một
   *  lần lúc service khởi tạo (bug cũ: tab mở xuyên nửa đêm sẽ đứng ở ngày
   *  hôm qua mãi mãi cho tới khi F5). */
  readonly today = this.day.today;
  private readonly manuallyOpened = signal<Holiday | null>(null);
  private readonly manualYear = signal(this.today().getFullYear());

  readonly activeHoliday = computed<Holiday | null>(() =>
    this.manuallyOpened() ?? resolveActivePopupHoliday(this.today()));
  readonly displayDate = computed(() => {
    const manual = this.manuallyOpened();
    return manual ? resolveOccurrenceDatesForYear(manual, this.manualYear())[0] ?? this.today() : this.today();
  });

  private readonly dismissedManually = signal(false);

  readonly notificationsEnabled = signal<boolean>(readStoredNotificationsEnabled());

  readonly visible = computed<boolean>(() => {
    if (this.manuallyOpened()) return true;
    if (this.holidayThemeService.previewing()) return false;
    if (this.holidayThemeService.mode() === 'off') return false;
    if (!this.notificationsEnabled()) return false;
    const holiday = this.activeHoliday();
    if (!holiday) return false;
    if (this.dismissedManually()) return false;
    return !this.isDismissedInStorage(holiday);
  });

  constructor() {
    effect(() => {
      if (!isBrowserStorageAvailable()) return;
      try {
        window.localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, this.notificationsEnabled() ? '1' : '0');
      } catch {
        // Ignore write failures (private browsing quota, etc.).
      }
    });

    // `visible` là computed, có thể tính lại nhiều lần trong lúc vẫn đang
    // true — chỉ kêu tiếng ở đúng cạnh lên (vừa chuyển từ ẩn sang hiện).
    let wasVisible = false;
    effect(() => {
      const isVisible = this.visible();
      if (isVisible && !wasVisible) this.sound.notifyKind('important');
      wasVisible = isVisible;
    });

    let previousDay = this.today().getTime();
    effect(() => {
      const nextDay = this.today().getTime();
      if (nextDay !== previousDay) untracked(() => {
        this.dismissedManually.set(false);
        this.manuallyOpened.set(null);
      });
      previousDay = nextDay;
    });
  }

  setNotificationsEnabled(enabled: boolean): void {
    this.notificationsEnabled.set(enabled);
  }

  /** Replaces `{year}` / `{nextYear}` placeholders using today's date. */
  resolveText(text: string): string {
    const year = this.displayDate().getFullYear();
    return text.replaceAll('{year}', String(year)).replaceAll('{nextYear}', String(year + 1));
  }

  showHoliday(holiday: Holiday, year = this.today().getFullYear()): void {
    this.manualYear.set(year);
    this.manuallyOpened.set(holiday);
  }

  dismiss(): void {
    if (this.manuallyOpened()) { this.manuallyOpened.set(null); return; }
    this.dismissedManually.set(true);
    const holiday = this.activeHoliday();
    if (!holiday || !isBrowserStorageAvailable()) return;
    try {
      window.localStorage.setItem(this.storageKeyFor(holiday), '1');
    } catch {
      // Ignore write failures (private browsing quota, etc.) — the in-memory
      // `dismissedManually` flag still hides the popup for this page visit.
    }
  }

  private storageKeyFor(holiday: Holiday): string {
    // One greeting per occurrence/year, not five interruptions during Tết.
    return `${DISMISS_KEY_PREFIX}v2:${holiday.id}:${this.today().getFullYear()}`;
  }

  private isDismissedInStorage(holiday: Holiday): boolean {
    if (!isBrowserStorageAvailable()) return false;
    try {
      return window.localStorage.getItem(this.storageKeyFor(holiday)) === '1' ||
        window.localStorage.getItem(`${DISMISS_KEY_PREFIX}${holiday.id}:${formatDateKey(this.today())}`) === '1';
    } catch {
      return false;
    }
  }
}
