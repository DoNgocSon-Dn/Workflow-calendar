import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { CalendarStore } from '../../data/calendar-store';
import { GroupStore } from '../../../groups/data/group-store';
import { Group } from '../../../groups/models/group.models';
import { CALENDAR_COLOR_HEX } from '../../models/calendar.models';
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
})
export class CalendarSidebar implements OnInit {
  protected readonly store = inject(CalendarStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly colorHex = CALENDAR_COLOR_HEX;

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

  ngOnInit(): void {
    this.groupStore.loadGroups();
  }

  onDateSelected(date: Date): void {
    this.store.goTo(date);
  }

  isVisible(calendarId: string): boolean {
    return this.store.visibleCalendarIds().has(calendarId);
  }

  onInviteClicked(event: Event, calendarId: string, calendarName: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.inviteClicked.emit({ calendarId, calendarName });
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
      alert('Không thể cập nhật trạng thái hiển thị của nhóm.');
    }
  }
}
