import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Clock } from '../clock';
import { VietnamCalendarDayService } from './vietnam-calendar-day.service';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });
function setup(instant: string) {
  vi.setSystemTime(new Date(instant));
  TestBed.configureTestingModule({ providers: [{ provide: Clock, useValue: { now: () => new Date() } }] });
  const service = TestBed.inject(VietnamCalendarDayService);
  TestBed.tick();
  return service;
}
describe('Vietnam holiday day', () => {
  it('moves into April 30 at midnight UTC+7 without a reload', async () => {
    const service = setup('2026-04-29T16:59:59Z');
    expect(service.today().getDate()).toBe(29);
    await vi.advanceTimersByTimeAsync(2100);
    expect(service.today().getDate()).toBe(30);
  });
  it('corrects the day after a sleeping tab returns to focus', () => {
    const service = setup('2026-09-01T10:00:00Z');
    vi.setSystemTime(new Date('2026-09-02T02:00:00Z'));
    window.dispatchEvent(new Event('focus'));
    expect(service.today().getDate()).toBe(2);
    expect(service.today().getMonth()).toBe(8);
  });
  it('removes its timer and listeners when destroyed', () => {
    const service = setup('2026-09-01T10:00:00Z');
    const before = service.today();
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(new Date('2026-09-02T02:00:00Z'));
    window.dispatchEvent(new Event('focus'));
    expect(service.today()).toBe(before);
  });
});
