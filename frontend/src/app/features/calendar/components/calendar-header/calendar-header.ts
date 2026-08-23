import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth-store';
import { CalendarStore } from '../../data/calendar-store';
import { CalendarViewMode } from '../../models/calendar.models';
import { addDays, monthYearLabel, startOfWeek } from '../../utils/date-utils';
import { NotificationButton } from '../../../../shared/components/notification/notification-button';
import { OpenGroupChatRequest } from '../../../../shared/components/notification/notification-panel';

/** Matches calendar-page.css / calendar-sidebar.css's mobile-drawer breakpoint. */
const MOBILE_BREAKPOINT_PX = 720;

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
  imports: [NotificationButton],
})
export class CalendarHeader {
  protected readonly store = inject(CalendarStore);
  protected readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  readonly openImport = output<void>();
  readonly openSettings = output<void>();
  readonly openEventFromNotification = output<string>();
  readonly openGroupFromNotification = output<OpenGroupChatRequest>();

  protected readonly userEmail = computed(() => this.authStore.user()?.email ?? '');
  protected readonly displayName = computed(() => this.authStore.displayName() ?? this.userEmail());
  protected readonly avatarUrl = computed(() => this.authStore.avatarUrl());
  protected readonly userInitial = computed(() => this.displayName().charAt(0).toUpperCase() || '?');
  protected readonly userMenuOpen = signal(false);
  protected readonly viewMenuOpen = signal(false);

  readonly viewModes: { mode: CalendarViewMode; label: string }[] = [
    { mode: 'day', label: 'Ngày' },
    { mode: 'week', label: 'Tuần' },
    { mode: 'month', label: 'Tháng' },
    { mode: 'agenda', label: 'Agenda' },
  ];

  readonly currentViewLabel = computed(
    () => this.viewModes.find((v) => v.mode === this.store.viewMode())?.label ?? '',
  );

  readonly periodLabel = computed(() => {
    const mode = this.store.viewMode();
    const focused = this.store.focusedDate();
    if (mode === 'month') return monthYearLabel(focused);
    if (mode === 'day') return FULL_DATE.format(focused);

    const start = startOfWeek(focused);
    const end = addDays(start, 6);
    return `${DAY_MONTH.format(start)} – ${DAY_MONTH.format(end)}, ${end.getFullYear()}`;
  });

  /** One control that does the useful thing per screen size: on mobile the
   *  sidebar is an overlay drawer, so it must fully show/hide; on desktop
   *  there's room to keep an icon rail, so it collapses instead of vanishing. */
  toggleSidebar(): void {
    if (window.innerWidth < MOBILE_BREAKPOINT_PX) {
      this.store.toggleSidebar();
    } else {
      this.store.toggleSidebarCollapsed();
    }
  }

  setViewMode(mode: CalendarViewMode): void {
    this.store.setViewMode(mode);
    this.viewMenuOpen.set(false);
  }

  toggleViewMenu(): void {
    this.viewMenuOpen.update((open) => !open);
  }

  closeViewMenu(): void {
    this.viewMenuOpen.set(false);
  }

  onNotificationOpenEvent(eventId: string): void {
    this.openEventFromNotification.emit(eventId);
  }

  onNotificationOpenGroup(request: OpenGroupChatRequest): void {
    this.openGroupFromNotification.emit(request);
  }

  toggleUserMenu(): void {
    this.userMenuOpen.update((open) => !open);
  }

  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  openProfileFromMenu(): void {
    this.closeUserMenu();
    this.openSettings.emit();
  }

  async logout(): Promise<void> {
    this.closeUserMenu();
    await this.authStore.signOut();
    await this.router.navigate(['/login']);
  }
}
