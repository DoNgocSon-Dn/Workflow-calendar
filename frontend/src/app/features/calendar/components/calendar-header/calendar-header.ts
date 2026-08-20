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
  protected readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  readonly openImport = output<void>();
  readonly openSettings = output<void>();
  readonly openTrash = output<void>();

  protected readonly userEmail = computed(() => this.authStore.user()?.email ?? '');
  protected readonly displayName = computed(() => this.authStore.displayName() ?? this.userEmail());
  protected readonly avatarUrl = computed(() => this.authStore.avatarUrl());
  protected readonly userInitial = computed(() => this.displayName().charAt(0).toUpperCase() || '?');
  protected readonly userMenuOpen = signal(false);
  protected readonly viewMenuOpen = signal(false);
  protected readonly gearMenuOpen = signal(false);
  protected readonly invitesMenuOpen = signal(false);
  protected readonly respondingInviteId = signal<string | null>(null);

  protected readonly pendingInvites = computed(() => this.store.pendingInvites());

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

  toggleGearMenu(): void {
    this.gearMenuOpen.update((open) => !open);
  }

  closeGearMenu(): void {
    this.gearMenuOpen.set(false);
  }

  openSettingsFromMenu(): void {
    this.gearMenuOpen.set(false);
    this.openSettings.emit();
  }

  openTrashFromMenu(): void {
    this.gearMenuOpen.set(false);
    this.openTrash.emit();
  }

  print(): void {
    this.gearMenuOpen.set(false);
    window.print();
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

  toggleInvitesMenu(): void {
    this.invitesMenuOpen.update((open) => !open);
  }

  closeInvitesMenu(): void {
    this.invitesMenuOpen.set(false);
  }

  async respondInvite(inviteId: string, status: 'accepted' | 'declined'): Promise<void> {
    if (this.respondingInviteId()) return;
    this.respondingInviteId.set(inviteId);
    try {
      await this.store.respondToCalendarInvite(inviteId, status);
    } catch {
      // Lỗi mạng — invite vẫn còn trong danh sách, người dùng có thể thử lại.
    } finally {
      this.respondingInviteId.set(null);
    }
  }

  async logout(): Promise<void> {
    this.closeUserMenu();
    await this.authStore.signOut();
    await this.router.navigate(['/login']);
  }
}
