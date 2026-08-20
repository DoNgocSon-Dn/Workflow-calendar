import { ChangeDetectionStrategy, Component, OnInit, computed, inject, output } from '@angular/core';
import { CalendarStore } from '../../data/calendar-store';
import { GroupStore } from '../../../groups/data/group-store';
import { Group } from '../../../groups/models/group.models';
import { CALENDAR_COLOR_HEX, CalendarDef } from '../../models/calendar.models';
import { MiniCalendar } from '../mini-calendar/mini-calendar';

@Component({
  selector: 'app-calendar-sidebar',
  templateUrl: './calendar-sidebar.html',
  styleUrl: './calendar-sidebar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MiniCalendar],
})
export class CalendarSidebar implements OnInit {
  protected readonly store = inject(CalendarStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly colorHex = CALENDAR_COLOR_HEX;

  readonly createClicked = output<void>();
  readonly createCalendarClicked = output<void>();
  readonly createGroupClicked = output<void>();
  readonly inviteClicked = output<{ calendarId: string; calendarName: string }>();

  protected readonly displayCalendars = computed(() => {
    const list = this.store.calendars();
    const seen = new Set<string>();
    const result: CalendarDef[] = [];
    for (const c of list) {
      const key = `${c.name.trim()}-${c.color}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(c);
      }
    }
    return result;
  });

  protected readonly displayGroups = computed(() => {
    const list = this.groupStore.groups();
    const seen = new Set<string>();
    const result: Group[] = [];
    for (const g of list) {
      const key = g.name.trim();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(g);
      }
    }
    return result;
  });

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
}
