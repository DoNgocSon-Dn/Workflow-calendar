import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatePicker } from '../../features/calendar/components/date-picker/date-picker';
import { TimePicker } from '../../features/calendar/components/time-picker/time-picker';
import { closeMobileDialog } from './mobile-back';
import { Capacitor } from '@capacitor/core';

afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); document.querySelectorAll('[data-picker-shell]').forEach(el => el.remove()); });
describe('Back inside a form picker', () => {
  it('offers an explicit Android close action without committing the highlighted time', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    TestBed.configureTestingModule({ imports: [TimePicker] });
    const fixture = TestBed.createComponent(TimePicker);
    const changed = vi.fn(); fixture.componentInstance.registerOnChange(changed);
    fixture.componentInstance.writeValue('22:15'); fixture.componentInstance.toggleOpen();
    await fixture.whenStable();
    const close = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-native-close]');
    expect(close).not.toBeNull(); close!.click(); await fixture.whenStable();
    expect(fixture.componentInstance.open()).toBe(false);
    expect(fixture.componentInstance.currentValue()).toBe('22:15'); expect(changed).not.toHaveBeenCalled();
  });
  for (const [name, picker, value] of [['date', DatePicker, '2026-11-01'], ['time', TimePicker, '09:00']] as const) {
    it(`closes only the ${name} picker, keeping the parent form and committed value`, async () => {
      TestBed.configureTestingModule({ imports: [picker] });
      const fixture = TestBed.createComponent<DatePicker | TimePicker>(picker);
      const shell = document.createElement('section');
      shell.setAttribute('role', 'dialog'); shell.setAttribute('data-picker-shell', '');
      const cancel = document.createElement('button'); cancel.setAttribute('data-native-close', '');
      const closeForm = vi.fn(); cancel.addEventListener('click', closeForm);
      shell.append(cancel, fixture.nativeElement); document.body.append(shell);
      const change = vi.fn(); fixture.componentInstance.registerOnChange(change);
      fixture.componentInstance.writeValue(value);
      fixture.componentInstance.toggleOpen(); await fixture.whenStable();
      expect(shell.querySelectorAll('[role=dialog]')).toHaveLength(1);
      expect(closeMobileDialog()).toBe(true); await fixture.whenStable();
      expect(fixture.componentInstance.open()).toBe(false);
      expect(closeForm).not.toHaveBeenCalled(); expect(change).not.toHaveBeenCalled();
      expect(fixture.componentInstance.currentValue()).toBe(value);
    });
  }
});
