import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
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
import { SettingsModal } from '../components/settings-modal/settings-modal';
import { TrashModal } from '../components/trash-modal/trash-modal';
import { CalendarStore } from '../data/calendar-store';
import { HolidayThemeService } from '../data/holiday-theme.service';
import { VN_HOLIDAY_CALENDAR_ID } from '../data/vietnam-holidays';
import { CalendarEvent } from '../models/calendar.models';
import { addMinutes, buildWeekDays, dateInputValue } from '../utils/date-utils';
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
  private readonly router = inject(Router);

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

  protected readonly trashModalOpen = signal(false);
  protected readonly settingsModalOpen = signal(false);
  protected readonly inviteModalTarget = signal<{ calendarId: string; calendarName: string } | null>(
    null,
  );
  protected readonly createCalendarModalOpen = signal(false);
  protected readonly createGroupModalOpen = signal(false);

  /** Popup "hoàn tất hồ sơ" lần đầu đăng nhập — bắt buộc điền cả Tên hiển thị
   *  lẫn Ngày sinh trước khi vào app, không có nút bỏ qua nữa: ngày sinh cần
   *  có sẵn cho tính năng chúc mừng sinh nhật, không xin sau thì gần như
   *  không ai chủ động vào Cài đặt tự điền. */
  protected readonly namePromptOpen = signal(false);
  protected readonly nameDraft = signal('');
  protected readonly dobDraft = signal('');
  /** Chặn chọn ngày sinh trong tương lai ngay ở bộ chọn ngày gốc của trình
   *  duyệt — "date of birth" mà sau hôm nay thì luôn là dữ liệu sai. */
  protected readonly maxDob = dateInputValue(new Date());
  protected readonly savingName = signal(false);
  protected readonly onboardingCanSubmit = computed(
    () => !!this.nameDraft().trim() && !!this.dobDraft(),
  );

  constructor() {
    this.notificationQueue.requestPermission();

    effect(() => {
      if (this.authStore.session()) {
        this.birthdayService.checkAndTriggerBirthday();
      }
    });

    // Lần đầu đăng nhập (chưa có tên hiển thị thật, hoặc chưa khai ngày sinh)
    // thì bắt hoàn tất hồ sơ trước — chạy 1 lần trong constructor, không cần
    // effect vì authStore đã init xong trước khi route vào được trang này
    // (authGuard chờ authStore.init() rồi mới cho qua).
    const currentName = this.authStore.displayName();
    const userEmail = this.authStore.user()?.email;
    const hasName = !!currentName && currentName !== userEmail;
    const hasDob = !!this.birthdayService.getUserDob();
    if (!hasName || !hasDob) {
      this.nameDraft.set(currentName ?? '');
      this.dobDraft.set(this.birthdayService.getUserDob());
      this.namePromptOpen.set(true);
    }
  }

  async completeOnboarding(): Promise<void> {
    if (!this.onboardingCanSubmit() || this.savingName()) return;
    this.savingName.set(true);
    try {
      await Promise.all([
        this.authStore.updateDisplayName(this.nameDraft().trim()),
        this.birthdayService.setUserDob(this.dobDraft()),
      ]);
      this.namePromptOpen.set(false);
    } finally {
      this.savingName.set(false);
    }
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

  openImportPage(): void {
    void this.router.navigate(['/calendar/import']);
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
