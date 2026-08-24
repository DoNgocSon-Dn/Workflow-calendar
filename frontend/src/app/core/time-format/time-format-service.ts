import { Injectable, effect, signal } from '@angular/core';
import { TimeFormat } from '../../features/calendar/utils/date-utils';

const STORAGE_KEY = 'timeFormat';

function readStoredTimeFormat(): TimeFormat {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === '12h' ? '12h' : '24h';
}

@Injectable({ providedIn: 'root' })
export class TimeFormatService {
  readonly format = signal<TimeFormat>(readStoredTimeFormat());

  constructor() {
    effect(() => {
      localStorage.setItem(STORAGE_KEY, this.format());
    });
  }

  setFormat(format: TimeFormat): void {
    this.format.set(format);
  }
}
