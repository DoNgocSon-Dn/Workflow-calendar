import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Clock } from '../clock';
import { scheduleVietnamMidnightTick, todayInVietnam } from '../utils/vietnam-time';

/** One civil day for holiday surfaces, including tabs asleep across midnight. */
@Injectable({ providedIn: 'root' })
export class VietnamCalendarDayService {
  private readonly clock = inject(Clock);
  private readonly day = signal(todayInVietnam(this.clock.now()), {
    equal: (a, b) => a.getTime() === b.getTime(),
  });
  readonly today = this.day.asReadonly();

  constructor() {
    const destroy = inject(DestroyRef);
    const refresh = () => this.day.set(todayInVietnam(this.clock.now()));
    const visible = () => { if (!document.hidden) refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    let cancelTick = () => {};
    effect(() => {
      this.clock.now();
      untracked(() => {
        refresh();
        cancelTick();
        cancelTick = scheduleVietnamMidnightTick(this.clock, refresh);
      });
    });
    destroy.onDestroy(() => {
      cancelTick();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    });
  }
}
