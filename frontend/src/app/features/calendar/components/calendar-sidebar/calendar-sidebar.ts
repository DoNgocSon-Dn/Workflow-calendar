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
import { TranslationService } from '../../../../core/i18n/translation.service';
import { DialogService } from '../../../../core/services/dialog.service';
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
  protected readonly i18n = inject(TranslationService);
  private readonly dialog = inject(DialogService);
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

  /** Lịch của một nhóm phải xoá qua "Xóa nhóm" (group-workspace-modal) —
   *  xoá thẳng ở đây sẽ làm nhóm mồ côi calendar_id thay vì mất theo nhóm. */
  private readonly groupCalendarIds = computed(
    () => new Set(this.groupStore.groups().map((g) => g.calendarId)),
  );

  protected readonly deletingCalendarId = signal<string | null>(null);

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
      await this.dialog.alert('Bạn cần giữ lại ít nhất một lịch có thể chỉnh sửa.');
      return;
    }

    const ok = await this.dialog.confirm(
      `Toàn bộ sự kiện trong lịch "${calendarName}" sẽ bị xóa và KHÔNG thể khôi phục.`,
      { title: `Xóa lịch "${calendarName}"?`, confirmLabel: 'Đồng ý xóa', danger: true },
    );
    if (!ok) return;

    this.deletingCalendarId.set(calendarId);
    try {
      await this.store.deleteCalendar(calendarId);
    } catch (err: any) {
      await this.dialog.alert(err?.error?.message || 'Không thể xóa lịch này.');
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
      await this.dialog.alert('Không thể cập nhật trạng thái hiển thị của nhóm.');
    }
  }
}
