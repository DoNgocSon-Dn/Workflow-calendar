import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslationService } from '../../../../core/i18n/translation.service';
import {
  addMonths,
  buildMonthGrid,
  fromDateInputValue,
  isSameDay,
  isSameMonth,
  monthYearLabel,
  startOfMonth,
  toDateInputValue,
} from '../../utils/date-utils';

/**
 * dd/mm/yyyy date field — `ControlValueAccessor`, value is the same
 * "yyyy-MM-dd" string a native `<input type="date">` produces (via
 * `toDateInputValue`/`fromDateInputValue`), so this drops in wherever that
 * native input was used with `formControlName` — no other code changes.
 *
 * Built to replace `<input type="date">` because Chromium ignores the
 * `lang` attribute for that control: its displayed format follows the
 * browser's own language setting, not the page. A Vietnamese-language user
 * on an English-locale browser saw mm/dd/yyyy despite `lang="vi"` already
 * being set on the input — confirmed empirically, not fixable without
 * dropping the native picker. This renders dd/mm/yyyy unconditionally.
 *
 * Deliberately NOT reusing `<app-mini-calendar>`: that component fires the
 * same `dateSelected` output for "navigate to another month" and "pick this
 * day" (correct for its one caller, the sidebar, where both mean "go to this
 * date"). A picker dropdown must NOT close/commit on month-nav clicks, so
 * this owns its own small grid instead of overloading that contract.
 */
@Component({
  selector: 'app-date-picker',
  templateUrl: './date-picker.html',
  styleUrl: './date-picker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'date-picker-host',
    '(document:click)': 'onDocumentClick($event)',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DatePicker),
      multi: true,
    },
  ],
})
export class DatePicker implements ControlValueAccessor {
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly i18n = inject(TranslationService);

  readonly ariaLabel = input<string>('Chọn ngày');

  /** "yyyy-MM-dd", or '' when no date is set. */
  readonly currentValue = signal('');
  readonly disabled = signal(false);
  readonly open = signal(false);

  /** Month currently shown in the dropdown grid — independent from the
   *  committed value so browsing months never mutates the form control. */
  readonly viewMonth = signal(startOfMonth(new Date()));

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  private readonly selectedDate = computed<Date | null>(() =>
    this.currentValue() ? fromDateInputValue(this.currentValue()) : null,
  );

  readonly displayLabel = computed(() => {
    const d = this.selectedDate();
    if (!d) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  });

  readonly monthLabel = computed(() => monthYearLabel(this.viewMonth(), this.i18n.locale()));
  readonly days = computed(() => buildMonthGrid(this.viewMonth()));

  readonly weekdayHeaders = computed(() => [
    this.i18n.t('weekday.mon'),
    this.i18n.t('weekday.tue'),
    this.i18n.t('weekday.wed'),
    this.i18n.t('weekday.thu'),
    this.i18n.t('weekday.fri'),
    this.i18n.t('weekday.sat'),
    this.i18n.t('weekday.sun'),
  ]);

  writeValue(value: string): void {
    this.currentValue.set(value ?? '');
    this.viewMonth.set(startOfMonth(value ? fromDateInputValue(value) : new Date()));
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  toggleOpen(): void {
    if (this.disabled()) return;
    this.open.update((v) => !v);
    if (this.open()) {
      this.viewMonth.set(startOfMonth(this.selectedDate() ?? new Date()));
    }
  }

  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.onTouched();
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  prevMonth(): void {
    this.viewMonth.update((m) => startOfMonth(addMonths(m, -1)));
  }

  nextMonth(): void {
    this.viewMonth.update((m) => startOfMonth(addMonths(m, 1)));
  }

  isSelected(day: Date): boolean {
    const d = this.selectedDate();
    return !!d && isSameDay(day, d);
  }

  isCurrentMonth(day: Date): boolean {
    return isSameMonth(day, this.viewMonth());
  }

  isToday(day: Date): boolean {
    return isSameDay(day, new Date());
  }

  selectDay(day: Date): void {
    const value = toDateInputValue(day);
    this.currentValue.set(value);
    this.onChange(value);
    this.close();
  }
}
