
import { Injectable, isDevMode, signal } from '@angular/core';

const DEV_OVERRIDE_KEY = 'dev-clock-override';

/** `isDevMode()` gates this to `ng serve` builds only — a stray value can
 *  never affect a production build, and localStorage is origin-scoped so a
 *  value set on localhost can't leak into the real deployed domain either. */
function readDevOverride(): Date | null {
  if (!isDevMode()) return null;
  try {
    const raw = localStorage.getItem(DEV_OVERRIDE_KEY);
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

/**
 * Wraps `new Date()` behind DI so components never call it directly,
 * keeping "today" swappable/mockable in tests — and, in dev builds only,
 * swappable at runtime via `setDevOverride()` so date-gated features
 * (holiday popup/backdrop, deadlines...) can be tested without waiting for
 * the real calendar date.
 */
@Injectable({ providedIn: 'root' })
export class Clock {
  private readonly devOverrideValue = signal<Date | null>(readDevOverride());

  /** DEV ONLY — non-null while a simulated "today" is active. The debug
   *  panel reads this to show current state. */
  readonly devOverride = this.devOverrideValue.asReadonly();

  now(): Date {
    return this.devOverrideValue() ?? new Date();
  }

  /**
   * DEV ONLY — no-op outside `ng serve` (see `isDevMode()` above). Persists
   * to localStorage then reloads the page: every "today"-derived signal in
   * the app (holiday popup/backdrop, ...) is computed once at service
   * construction, so a full reload is the simplest way to get them all
   * consistent instead of reactively patching each one individually.
   */
  setDevOverride(date: Date | null): void {
    if (!isDevMode()) return;
    try {
      if (date) localStorage.setItem(DEV_OVERRIDE_KEY, date.toISOString());
      else localStorage.removeItem(DEV_OVERRIDE_KEY);
    } catch {
      // Private mode / storage full — dev tool only, safe to ignore.
    }
    location.reload();
  }
}
