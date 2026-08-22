import { Injectable, computed, signal } from '@angular/core';
import { HOLIDAYS } from '../../data/holidays.data';
import { Holiday, HolidayDateRule } from '../../models/holiday-theme.model';

const DISMISS_KEY_PREFIX = 'holiday-popup-dismissed:';

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

function matchesDateRule(rule: HolidayDateRule, today: Date): boolean {
  if (rule.kind === 'fixed') {
    return today.getMonth() + 1 === rule.month && today.getDate() === rule.day;
  }
  const todayKey = formatDateKey(today);
  return rule.ranges.some(
    (range) => range.year === today.getFullYear() && todayKey >= range.start && todayKey <= range.end,
  );
}

function resolveActiveHoliday(today: Date): Holiday | null {
  const matches = HOLIDAYS.filter((holiday) => matchesDateRule(holiday.dateRule, today));
  if (matches.length === 0) return null;
  return matches.reduce((best, candidate) => (candidate.priority < best.priority ? candidate : best));
}

/**
 * Resolves which holiday (if any) is active today, and whether its popup
 * should currently be visible. The dismissal state is remembered per holiday
 * per calendar day in localStorage, so closing the popup does not bring it
 * back on every navigation within the same day, but it reappears next year
 * (or the next matching day).
 */
@Injectable({ providedIn: 'root' })
export class HolidayPopupService {
  private readonly today = new Date();

  readonly activeHoliday = computed<Holiday | null>(() => resolveActiveHoliday(this.today));

  private readonly dismissedManually = signal(false);

  readonly visible = computed<boolean>(() => {
    const holiday = this.activeHoliday();
    if (!holiday) return false;
    if (this.dismissedManually()) return false;
    return !this.isDismissedInStorage(holiday);
  });

  /** Replaces `{year}` / `{nextYear}` placeholders using today's date. */
  resolveText(text: string): string {
    const year = this.today.getFullYear();
    return text.replace('{year}', String(year)).replace('{nextYear}', String(year + 1));
  }

  dismiss(): void {
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
    return `${DISMISS_KEY_PREFIX}${holiday.id}:${formatDateKey(this.today)}`;
  }

  private isDismissedInStorage(holiday: Holiday): boolean {
    if (!isBrowserStorageAvailable()) return false;
    try {
      return window.localStorage.getItem(this.storageKeyFor(holiday)) === '1';
    } catch {
      return false;
    }
  }
}
