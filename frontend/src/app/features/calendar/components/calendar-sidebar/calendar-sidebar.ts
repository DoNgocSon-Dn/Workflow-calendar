import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { CalendarStore, localizedCalendarName } from '../../data/calendar-store';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { DialogService } from '../../../../core/services/dialog.service';
import { GroupStore } from '../../../groups/data/group-store';
import { Group } from '../../../groups/models/group.models';
import { CALENDAR_COLOR_HEX, CalendarColor } from '../../models/calendar.models';
import { Icon } from '../../../../shared/components/icon/icon';
import { MiniCalendar } from '../mini-calendar/mini-calendar';

/** Cùng một nhóm có thể về từ nhiều membership; sidebar chỉ hiện một dòng. */
function dedupeByName(groups: Group[]): Group[] {
  const seen = new Set<string>();
  const result: Group[] = [];
  for (const g of groups) {
    const key = g.name.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(g);
  }
  return result;
}

@Component({
  selector: 'app-calendar-sidebar',
  templateUrl: './calendar-sidebar.html',
  styleUrl: './calendar-sidebar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MiniCalendar, Icon],
  host: {
    '(document:click)': 'activeColorPickerId.set(null)',
  },
})
export class CalendarSidebar implements OnInit {
  protected readonly store = inject(CalendarStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly i18n = inject(TranslationService);
  private readonly dialog = inject(DialogService);
  protected readonly colorHex = CALENDAR_COLOR_HEX;

  protected readonly activeColorPickerId = signal<string | null>(null);
  protected readonly availableColors: CalendarColor[] = [
    'blue',
    'green',
    'orange',
    'red',
    'purple',
    'teal',
  ];

  toggleColorPicker(event: Event, calendarId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.activeColorPickerId.update((curr) => (curr === calendarId ? null : calendarId));
  }

  async selectColor(event: Event, calendarId: string, color: CalendarColor): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.activeColorPickerId.set(null);
    try {
      await this.store.updateCalendarColor(calendarId, color);
    } catch {
      // Ignore
    }
  }

  readonly createClicked = output<void>();
  readonly createCalendarClicked = output<void>();
  readonly createGroupClicked = output<void>();
  readonly inviteClicked = output<{ calendarId: string; calendarName: string }>();

  // CalendarStore đã gộp lịch trùng ngay khi nhận từ API, nên sidebar không cần
  // gộp lại lần nữa — và nhờ vậy nó khớp với bảng chọn lịch trong form sự kiện.
  protected readonly displayCalendars = this.store.calendars;

  protected readonly displayGroups = computed(() => dedupeByName(this.groupStore.visibleGroups()));
  protected readonly hiddenGroups = computed(() => dedupeByName(this.groupStore.hiddenGroups()));

  protected readonly hiddenSectionOpen = signal(false);

  /** Lịch của một nhóm phải xoá qua "Xóa nhóm" (group-workspace-modal) —
   *  xoá thẳng ở đây sẽ làm nhóm mồ côi calendar_id thay vì mất theo nhóm. */
  private readonly groupCalendarIds = computed(
    () => new Set(this.groupStore.groups().map((g) => g.calendarId)),
  );

  protected readonly deletingCalendarId = signal<string | null>(null);

  protected isPersonalCalendar(calendarId: string): boolean {
    return !this.groupCalendarIds().has(calendarId);
  }

  protected canDeleteCalendar(cal: { id: string; canEdit: boolean }): boolean {
    return cal.canEdit && !this.groupCalendarIds().has(cal.id);
  }

  ngOnInit(): void {
    this.groupStore.loadGroups();
  }

  onDateSelected(date: Date): void {
    this.store.goTo(date);
  }

  isVisible(calendarId: string): boolean {
    return this.store.visibleCalendarIds().has(calendarId);
  }

  /** Display label for a calendar — localises the auto-created "Cá nhân". */
  calendarLabel(cal: { name: string }): string {
    return localizedCalendarName(cal.name, (k) => this.i18n.t(k));
  }

  onInviteClicked(event: Event, calendarId: string, calendarName: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.inviteClicked.emit({ calendarId, calendarName });
  }

  async onDeleteCalendarClicked(event: Event, calendarId: string, calendarName: string): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (this.deletingCalendarId()) return;

    // Phải còn ít nhất một lịch ghi được — nhiều chỗ trong app (trợ lý AI,
    // import, tạo sự kiện nhanh) giả định defaultWritableCalendar() luôn có.
    const writableCount = this.store.calendars().filter((c) => c.canEdit).length;
    if (writableCount <= 1) {
      await this.dialog.alert(this.i18n.t('sidebar.needWritableCalendar'));
      return;
    }

    const ok = await this.dialog.confirm(
      this.i18n.t('sidebar.deleteCalendarBody', { name: calendarName }),
      {
        title: this.i18n.t('sidebar.deleteCalendarTitle', { name: calendarName }),
        confirmLabel: this.i18n.t('sidebar.deleteCalendarConfirm'),
        danger: true,
      },
    );
    if (!ok) return;

    this.deletingCalendarId.set(calendarId);
    try {
      await this.store.deleteCalendar(calendarId);
    } catch (err: unknown) {
      const body = (err as { error?: { message?: string } })?.error;
      await this.dialog.alert(body?.message || this.i18n.t('sidebar.deleteCalendarError'));
    } finally {
      this.deletingCalendarId.set(null);
    }
  }

  onGroupClicked(group: Group): void {
    this.groupStore.selectGroup(group);
  }

  toggleHiddenSection(): void {
    this.hiddenSectionOpen.update((open) => !open);
  }

  async onToggleGroupHidden(event: Event, group: Group): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    try {
      await this.groupStore.setGroupHidden(group.id, !group.hidden);
    } catch {
      await this.dialog.alert(this.i18n.t('sidebar.groupVisibilityError'));
    }
  }
}
