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
import { formatTimeLabel, parseTime24 } from '../../utils/date-utils';

interface ClockMark {
  value: number;
  x: number;
  y: number;
}

function buildMarks(values: number[], radius: number): ClockMark[] {
  const cx = 100;
  const cy = 100;
  return values.map((value, i) => {
    const angle = (i / values.length) * 2 * Math.PI - Math.PI / 2;
    return {
      value,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });
}

const HOUR_MARKS = buildMarks([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 78);
const MINUTE_MARKS = buildMarks(
  [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
  78,
);
const LIST_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = (i % 2) * 30;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

/** 24h "HH:mm" time field. Implements ControlValueAccessor for use with formControlName. */
@Component({
  selector: 'app-time-picker',
  templateUrl: './time-picker.html',
  styleUrl: './time-picker.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'time-picker-host',
    '(document:click)': 'onDocumentClick($event)',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TimePicker),
      multi: true,
    },
  ],
})
export class TimePicker implements ControlValueAccessor {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly ariaLabel = input<string>('Chọn giờ');

  readonly currentValue = signal('09:00');
  readonly disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  readonly open = signal(false);
  readonly tab = signal<'list' | 'clock'>('list');
  readonly clockStep = signal<'hour' | 'minute'>('hour');

  readonly hourMarks = HOUR_MARKS;
  readonly minuteMarks = MINUTE_MARKS;
  readonly listOptions = LIST_OPTIONS;

  private readonly refDay = new Date(2000, 0, 1);

  readonly hour24 = computed(() => Number(this.currentValue().split(':')[0] ?? 0));
  readonly minute = computed(() => Number(this.currentValue().split(':')[1] ?? 0));
  readonly isPm = computed(() => this.hour24() >= 12);
  readonly hour12 = computed(() => {
    const h = this.hour24() % 12;
    return h === 0 ? 12 : h;
  });
  readonly displayLabel = computed(() =>
    formatTimeLabel(parseTime24(this.currentValue(), this.refDay)),
  );

  readonly selectedHourMark = computed(() => this.hour12());
  readonly selectedMinuteMark = computed(() => {
    const m = this.minute();
    return MINUTE_MARKS.reduce((closest, mark) =>
      Math.abs(mark.value - m) < Math.abs(closest.value - m) ? mark : closest,
    ).value;
  });

  writeValue(value: string): void {
    this.currentValue.set(value || '00:00');
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
    if (this.open()) this.clockStep.set('hour');
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

  selectTab(tab: 'list' | 'clock'): void {
    this.tab.set(tab);
  }

  selectListOption(option: string): void {
    this.emit(option);
    this.close();
  }

  selectHour(h12: number): void {
    const pm = this.isPm();
    const h24 = (h12 % 12) + (pm ? 12 : 0);
    this.writeTime(h24, this.minute());
    this.clockStep.set('minute');
  }

  selectMinute(m: number): void {
    this.writeTime(this.hour24(), m);
    this.close();
  }

  setAmPm(pm: boolean): void {
    const h12 = this.hour12();
    const h24 = (h12 % 12) + (pm ? 12 : 0);
    this.writeTime(h24, this.minute());
  }

  private writeTime(h24: number, m: number): void {
    this.emit(`${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }

  private emit(value: string): void {
    this.currentValue.set(value);
    this.onChange(value);
  }
}
