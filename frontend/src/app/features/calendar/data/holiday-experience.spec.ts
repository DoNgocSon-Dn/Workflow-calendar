import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HolidayThemeService } from './holiday-theme.service';
import { VietnamCalendarDayService } from '../../../core/services/vietnam-calendar-day.service';
import { HolidayPopupService } from '../../../core/services/holiday-popup.service';
import { NotificationSoundService } from '../../../core/services/notification-sound.service';
import { findHolidayById } from '../utils/holiday-resolver';
import { HolidayPopup } from '../../../shared/components/holiday-popup/holiday-popup';

beforeEach(() => {
  vi.useFakeTimers();
  for (const key of Object.keys(localStorage)) if (key.startsWith('holiday-')) localStorage.removeItem(key);
});
afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });

function setup(date = new Date(2026, 3, 30)) {
  const today = signal(date);
  TestBed.configureTestingModule({ providers: [
    { provide: VietnamCalendarDayService, useValue: { today } },
    { provide: NotificationSoundService, useValue: { notifyKind: vi.fn() } },
  ] });
  const themes = TestBed.inject(HolidayThemeService);
  const popup = TestBed.inject(HolidayPopupService);
  TestBed.tick();
  return { today, themes, popup };
}

describe('automatic Vietnamese holiday experience', () => {
  it('uses the Vietnam day without requiring CalendarStore or any API', () => {
    const { themes, today } = setup();
    expect(themes.activeHolidayId()).toBe('reunification-day');
    expect(document.documentElement.dataset['holiday']).toBe('reunification-day');
    today.set(new Date(2026, 4, 1)); TestBed.tick();
    expect(themes.activeHolidayId()).toBe('labor-day');
  });
  it('returns to the saved off preference after a temporary preview expires', async () => {
    const { themes, today } = setup();
    themes.setMode('off'); TestBed.tick();
    const original = today();
    themes.preview('tet-nguyen-dan', 2027); TestBed.tick();
    expect(themes.activeHolidayId()).toBe('tet-nguyen-dan');
    expect(themes.mode()).toBe('off');
    expect(today()).toBe(original);
    await vi.advanceTimersByTimeAsync(300001); TestBed.tick();
    expect(themes.activeHoliday()).toBeNull();
    expect(themes.mode()).toBe('off');
    expect(localStorage.getItem('holiday-theme-mode')).toBe('off');
  });
  it('clears preview and decoration when the user turns holiday mode off', () => {
    const { themes } = setup();
    themes.preview('mid-autumn'); TestBed.tick();
    themes.setMode('off'); TestBed.tick();
    expect(themes.previewing()).toBe(false);
    expect(document.documentElement.hasAttribute('data-holiday')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--holiday-fallback-light')).toBe('');
  });
  it('shows the automatic Tết greeting once across its five-day period, then again next year', () => {
    const { popup, today } = setup(new Date(2026, 1, 17));
    expect(popup.visible()).toBe(true);
    popup.dismiss();
    today.set(new Date(2026, 1, 18)); TestBed.tick();
    expect(popup.visible()).toBe(false);
    today.set(new Date(2027, 1, 6)); TestBed.tick();
    expect(popup.visible()).toBe(true);
  });
  it('allows an explicit greeting preview without changing notification preferences or the clock', () => {
    const { popup, themes, today } = setup();
    themes.setMode('off'); popup.setNotificationsEnabled(false); TestBed.tick();
    const original = today();
    popup.showHoliday(findHolidayById('tet-nguyen-dan')!, 2027); TestBed.tick();
    expect(popup.visible()).toBe(true);
    expect(popup.displayDate().getFullYear()).toBe(2027);
    expect(popup.displayDate().getMonth()).toBe(1);
    expect(popup.displayDate().getDate()).toBe(6);
    popup.dismiss(); TestBed.tick();
    expect(popup.visible()).toBe(false);
    expect(popup.notificationsEnabled()).toBe(false);
    expect(today()).toBe(original);
  });
  it('can close and reopen a greeting after the exit animation', async () => {
    const { popup, themes } = setup();
    themes.setMode('off'); TestBed.tick();
    const fixture = TestBed.createComponent(HolidayPopup);
    popup.showHoliday(findHolidayById('tet-nguyen-dan')!); fixture.detectChanges(); TestBed.tick();
    fixture.componentInstance.close(); await vi.advanceTimersByTimeAsync(230); TestBed.tick();
    expect(popup.visible()).toBe(false);
    popup.showHoliday(findHolidayById('national-day')!); fixture.detectChanges(); TestBed.tick();
    expect(fixture.nativeElement.querySelector('.holiday-popup--closing')).toBeNull();
    fixture.componentInstance.close(); await vi.advanceTimersByTimeAsync(230); TestBed.tick();
    expect(popup.visible()).toBe(false);
  });
});
