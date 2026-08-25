import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { AuthStore } from '../../../core/auth/auth-store';
import { DensityService } from '../../../core/density/density-service';
import { NotificationQueue } from '../../../core/realtime/notification-queue';
import { CalendarHeader } from '../components/calendar-header/calendar-header';
import { CalendarSidebar } from '../components/calendar-sidebar/calendar-sidebar';
import { CreateCalendarModal } from '../components/create-calendar-modal/create-calendar-modal';
import { EventFormModal } from '../components/event-form-modal/event-form-modal';
import { HolidayInfoModal } from '../components/holiday-info-modal/holiday-info-modal';
import { InviteModal } from '../components/invite-modal/invite-modal';
import { CreateRequest, MonthView } from '../components/month-view/month-view';
import { NotificationPopup } from '../components/notification-popup/notification-popup';
import { TimeGridView } from '../components/time-grid-view/time-grid-view';
import { AgendaView } from '../components/agenda-view/agenda-view';
import { ImportModalComponent } from '../components/import-modal/import-modal';
import { SettingsModal } from '../components/settings-modal/settings-modal';
import { TrashModal } from '../components/trash-modal/trash-modal';
import { CalendarStore } from '../data/calendar-store';
import { HolidayThemeService } from '../data/holiday-theme.service';
import { findHolidayById } from '../utils/holiday-resolver';
import { VN_HOLIDAY_CALENDAR_ID } from '../data/vietnam-holidays';
import { CalendarEvent } from '../models/calendar.models';
import { addMinutes, buildWeekDays } from '../utils/date-utils';
import { CreateGroupModal } from '../../groups/components/create-group-modal/create-group-modal';
import { GroupWorkspaceModal } from '../../groups/components/group-workspace-modal/group-workspace-modal';
import { GroupStore } from '../../groups/data/group-store';
import { OpenGroupChatRequest } from '../../../shared/components/notification/notification-panel';
import { HolidayPopup } from '../../../shared/components/holiday-popup/holiday-popup';
import { FloatingHub } from '../../../shared/components/floating-hub/floating-hub';
import { LoginSuccessTransition } from '../../auth/login-success-transition/login-success-transition';
import { BirthdayPopup } from '../../../shared/components/birthday-popup/birthday-popup';
import { BirthdayPopupService } from '../../../core/services/birthday-popup.service';
import { consumeOauthRedirect } from '../../../core/auth/oauth-redirect-flag';

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
    FloatingHub,
    HolidayPopup,
    BirthdayPopup,
    HolidayInfoModal,
    LoginSuccessTransition,
  ],
})
export class CalendarPage {
  private readonly birthdayService = inject(BirthdayPopupService);
  protected readonly store = inject(CalendarStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly authStore = inject(AuthStore);
  protected readonly holidayThemeService = inject(HolidayThemeService);
  private readonly notificationQueue = inject(NotificationQueue);
  private readonly densityService = inject(DensityService);

  /** Icon lễ đang active, phóng to làm watermark mờ phía sau lưới lịch (spec:
   *  vẫn nhìn xuyên qua được, không che nội dung). null khi không có lễ nào
   *  hoặc holiday đó không có icon. */
  protected readonly holidayWatermarkIcon = computed(() => null);

  protected readonly weekDays = computed(() => buildWeekDays(this.store.focusedDate()));
  protected readonly dayViewDays = computed(() => [this.store.focusedDate()]);

  protected readonly modalState = signal<ModalState | null>(null);
  protected readonly holidayInfoEvent = signal<CalendarEvent | null>(null);
  /**
   * Chỉ bật khi người dùng vừa từ Google quay về (cờ được chụp ở main.ts) và
   * không bật chế độ giảm chuyển động. Cờ tự xoá sau lần đọc đầu nên F5 hay
   * điều hướng nội bộ về sau vào thẳng lịch.
   */
  protected readonly loginTransitionOpen = signal(
    consumeOauthRedirect() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  protected readonly importModalOpen = signal(false);
  protected readonly trashModalOpen = signal(false);
  protected readonly settingsModalOpen = signal(false);
  protected readonly inviteModalTarget = signal<{ calendarId: string; calendarName: string } | null>(
    null,
  );
  protected readonly createCalendarModalOpen = signal(false);
  protected readonly createGroupModalOpen = signal(false);

  protected readonly namePromptOpen = signal(false);
  protected readonly nameDraft = signal('');
  protected readonly savingName = signal(false);

  constructor() {
    this.notificationQueue.requestPermission();

    effect(() => {
      if (this.authStore.session()) {
        this.birthdayService.checkAndTriggerBirthday();
      }
    });

    // Check if user needs to set a display name after logging in
    const currentName = this.authStore.displayName();
    const userEmail = this.authStore.user()?.email;
    if (!currentName || currentName === userEmail) {
      this.nameDraft.set(currentName ?? '');
      this.namePromptOpen.set(true);
    }
  }

  async saveDisplayName(): Promise<void> {
    const name = this.nameDraft().trim();
    if (!name) return;
    this.savingName.set(true);
    await this.authStore.updateDisplayName(name);
    this.savingName.set(false);
    this.namePromptOpen.set(false);
  }

  onViewDetail(eventId: string): void {
    // Must search visibleEvents (not just events), since agenda items can be
    // read-only holiday entries that live in a separate static list.
    const event = this.store.visibleEvents().find((e) => e.id === eventId);
    if (event) this.openEdit(event);
  }

  onOpenGroupFromNotification(request: OpenGroupChatRequest): void {
    void this.groupStore.openGroupChat(request.groupId, request.messageId);
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
    if (event.calendarId === VN_HOLIDAY_CALENDAR_ID) {
      this.holidayInfoEvent.set(event);
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
