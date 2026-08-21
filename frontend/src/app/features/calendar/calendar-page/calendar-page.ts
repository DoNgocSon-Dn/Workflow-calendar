import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DensityService } from '../../../core/density/density-service';
import { NotificationQueue } from '../../../core/realtime/notification-queue';
import { AiChatWidget } from '../../ai-assistant/ai-chat-widget';
import { NotesWidget } from '../../notes/notes-widget';
import { CalendarHeader } from '../components/calendar-header/calendar-header';
import { CalendarSidebar } from '../components/calendar-sidebar/calendar-sidebar';
import { CreateCalendarModal } from '../components/create-calendar-modal/create-calendar-modal';
import { EventFormModal } from '../components/event-form-modal/event-form-modal';
import { InviteModal } from '../components/invite-modal/invite-modal';
import { CreateRequest, MonthView } from '../components/month-view/month-view';
import { NotificationPopup } from '../components/notification-popup/notification-popup';
import { TimeGridView } from '../components/time-grid-view/time-grid-view';
import { AgendaView } from '../components/agenda-view/agenda-view';
import { ImportModalComponent } from '../components/import-modal/import-modal';
import { SettingsModal } from '../components/settings-modal/settings-modal';
import { TrashModal } from '../components/trash-modal/trash-modal';
import { CalendarStore } from '../data/calendar-store';
import { VN_HOLIDAY_CALENDAR_ID, resolveHolidayThemeId } from '../data/vietnam-holidays';
import { CalendarEvent } from '../models/calendar.models';
import { addMinutes, buildWeekDays } from '../utils/date-utils';
import { CreateGroupModal } from '../../groups/components/create-group-modal/create-group-modal';
import { GroupWorkspaceModal } from '../../groups/components/group-workspace-modal/group-workspace-modal';
import { GroupStore } from '../../groups/data/group-store';
import { HolidayPopup } from '../../../shared/components/holiday-popup/holiday-popup';
import { HolidayPopupService } from '../../../core/services/holiday-popup.service';

interface ModalState {
  event: CalendarEvent | null;
  defaultStart: Date | null;
  defaultEnd: Date | null;
  defaultAllDay: boolean;
  defaultTitle: string;
}

@Component({
  selector: 'app-calendar-page',
  templateUrl: './calendar-page.html',
  styleUrl: './calendar-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CalendarHeader,
    CalendarSidebar,
    MonthView,
    TimeGridView,
    AgendaView,
    ImportModalComponent,
    TrashModal,
    SettingsModal,
    EventFormModal,
    InviteModal,
    CreateCalendarModal,
    CreateGroupModal,
    GroupWorkspaceModal,
    NotificationPopup,
    HolidayPopup,
    NotesWidget,
    AiChatWidget,
  ],
})
export class CalendarPage {
  protected readonly store = inject(CalendarStore);
  protected readonly groupStore = inject(GroupStore);
  private readonly notificationQueue = inject(NotificationQueue);
  private readonly densityService = inject(DensityService);
  private readonly holidayPopupService = inject(HolidayPopupService);

  protected readonly weekDays = computed(() => buildWeekDays(this.store.focusedDate()));
  protected readonly dayViewDays = computed(() => [this.store.focusedDate()]);

  protected readonly modalState = signal<ModalState | null>(null);
  protected readonly importModalOpen = signal(false);
  protected readonly trashModalOpen = signal(false);
  protected readonly settingsModalOpen = signal(false);
  protected readonly inviteModalTarget = signal<{ calendarId: string; calendarName: string } | null>(
    null,
  );
  protected readonly createCalendarModalOpen = signal(false);
  protected readonly createGroupModalOpen = signal(false);

  constructor() {
    this.notificationQueue.requestPermission();
  }

  onViewDetail(eventId: string): void {
    const event = this.store.events().find((e) => e.id === eventId);
    if (event) this.openEdit(event);
  }

  openCreateBlank(): void {
    const start = this.store.today();
    start.setHours(start.getHours() + 1, 0, 0, 0);
    this.modalState.set({
      event: null,
      defaultStart: start,
      defaultEnd: addMinutes(start, 60),
      defaultAllDay: false,
      defaultTitle: '',
    });
  }

  openCreate(request: CreateRequest): void {
    this.modalState.set({
      event: null,
      defaultStart: request.start,
      defaultEnd: request.end,
      defaultAllDay: request.allDay,
      defaultTitle: '',
    });
  }

  openEdit(event: CalendarEvent): void {
    // Ngày lễ Việt Nam chỉ để tham khảo, không sửa/xoá được như event thật —
    // bấm vào thì mở popup theme ngày lễ tương ứng thay vì form chỉnh sửa.
    if (event.calendarId === VN_HOLIDAY_CALENDAR_ID) {
      const themeId = resolveHolidayThemeId(event);
      if (themeId) this.holidayPopupService.showHoliday(themeId);
      return;
    }
    this.modalState.set({
      event,
      defaultStart: null,
      defaultEnd: null,
      defaultAllDay: false,
      defaultTitle: '',
    });
  }

  openManualFormFromAi(title: string): void {
    const start = this.store.today();
    start.setHours(start.getHours() + 1, 0, 0, 0);
    this.modalState.set({
      event: null,
      defaultStart: start,
      defaultEnd: addMinutes(start, 60),
      defaultAllDay: false,
      defaultTitle: title,
    });
  }

  closeModal(): void {
    this.modalState.set(null);
  }

  openInvite(target: { calendarId: string; calendarName: string }): void {
    this.inviteModalTarget.set(target);
  }

  closeInviteModal(): void {
    this.inviteModalTarget.set(null);
  }

  onCalendarCreated(target: { calendarId: string; calendarName: string }): void {
    this.createCalendarModalOpen.set(false);
    this.inviteModalTarget.set(target);
  }

  onGroupCreated(target: { groupId: string; groupName: string }): void {
    this.createGroupModalOpen.set(false);
  }
}
