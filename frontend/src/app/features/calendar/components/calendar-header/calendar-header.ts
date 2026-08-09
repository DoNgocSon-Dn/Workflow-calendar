import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth-store';
import { ThemeToggle } from '../../../../core/theme/theme-toggle/theme-toggle';
import { CalendarStore } from '../../data/calendar-store';
import { CalendarViewMode } from '../../models/calendar.models';
import { addDays, monthYearLabel, startOfWeek } from '../../utils/date-utils';

const DAY_MONTH = new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'short' });
const FULL_DATE = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

@Component({
  selector: 'app-calendar-header',
  templateUrl: './calendar-header.html',
  styleUrl: './calendar-header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ThemeToggle],
})
export class CalendarHeader {
  protected readonly store = inject(CalendarStore);
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly userEmail = computed(() => this.authStore.user()?.email ?? '');

  readonly viewModes: { mode: CalendarViewMode; label: string }[] = [
    { mode: 'day', label: 'Ngày' },
    { mode: 'week', label: 'Tuần' },
    { mode: 'month', label: 'Tháng' },
  ];

  readonly periodLabel = computed(() => {
    const mode = this.store.viewMode();
    const focused = this.store.focusedDate();
    if (mode === 'month') return monthYearLabel(focused);
    if (mode === 'day') return FULL_DATE.format(focused);

    const start = startOfWeek(focused);
    const end = addDays(start, 6);
    return `${DAY_MONTH.format(start)} – ${DAY_MONTH.format(end)}, ${end.getFullYear()}`;
  });

  setViewMode(mode: CalendarViewMode): void {
    this.store.setViewMode(mode);
  }

  async logout(): Promise<void> {
    await this.authStore.signOut();
    await this.router.navigate(['/login']);
  }
}
