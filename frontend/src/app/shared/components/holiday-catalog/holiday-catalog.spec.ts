import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { HolidayCatalog } from './holiday-catalog';
import { VietnamCalendarDayService } from '../../../core/services/vietnam-calendar-day.service';
import { HolidayThemeService } from '../../../features/calendar/data/holiday-theme.service';

afterEach(() => { TestBed.resetTestingModule(); localStorage.removeItem('holiday-theme-mode'); });
describe('holiday catalogue controls', () => {
  it('keeps the displayed year and selected holiday consistent with the preview', async () => {
    const today = signal(new Date(2026, 10, 1));
    TestBed.configureTestingModule({ imports: [HolidayCatalog], providers: [
      { provide: VietnamCalendarDayService, useValue: { today } },
    ] });
    const fixture = TestBed.createComponent(HolidayCatalog);
    fixture.detectChanges(); await fixture.whenStable();
    const controls = fixture.nativeElement.querySelectorAll('select') as NodeListOf<HTMLSelectElement>;
    expect(controls[0].value).toBe('2026');
    expect(controls[2].value).toBe('tet-nguyen-dan');
    controls[0].value = '2027'; controls[0].dispatchEvent(new Event('change'));
    fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('6/2/2027');
    fixture.nativeElement.querySelector('button.preview').click();
    fixture.detectChanges(); await fixture.whenStable();
    const themes = TestBed.inject(HolidayThemeService);
    expect(themes.activeHolidayId()).toBe('tet-nguyen-dan');
    expect(themes.previewYear()).toBe(2027);
    expect(today().getFullYear()).toBe(2026);
  });
  it('selects an available holiday when switching from lunar to solar', async () => {
    TestBed.configureTestingModule({ imports: [HolidayCatalog], providers: [
      { provide: VietnamCalendarDayService, useValue: { today: signal(new Date(2026, 10, 1)) } },
    ] });
    const fixture = TestBed.createComponent(HolidayCatalog);
    fixture.detectChanges(); await fixture.whenStable();
    const controls = fixture.nativeElement.querySelectorAll('select') as NodeListOf<HTMLSelectElement>;
    controls[1].value = 'solar'; controls[1].dispatchEvent(new Event('change'));
    fixture.detectChanges(); await fixture.whenStable();
    expect(controls[2].value).toBe('new-year');
    expect(fixture.nativeElement.querySelector('.sample strong').textContent).toContain('Tết Dương Lịch');
  });
});
