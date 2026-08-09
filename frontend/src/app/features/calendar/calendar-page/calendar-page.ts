import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NotificationQueue } from '../../../core/realtime/notification-queue';
import { AiChatWidget } from '../../ai-assistant/ai-chat-widget';
import { NotesWidget } from '../../notes/notes-widget';
import { CalendarHeader } from '../components/calendar-header/calendar-header';
import { CalendarSidebar } from '../components/calendar-sidebar/calendar-sidebar';
import { EventFormModal } from '../components/event-form-modal/event-form-modal';
import { CreateRequest, MonthView } from '../components/month-view/month-view';
import { NotificationPopup } from '../components/notification-popup/notification-popup';
import { TimeGridView } from '../components/time-grid-view/time-grid-view';
import { CalendarStore } from '../data/calendar-store';
import { CalendarEvent } from '../models/calendar.models';
import { addMinutes, buildWeekDays } from '../utils/date-utils';

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
    EventFormModal,
    NotificationPopup,
    NotesWidget,
    AiChatWidget,
  ],
})
export class CalendarPage {
  protected readonly store = inject(CalendarStore);
  private readonly notificationQueue = inject(NotificationQueue);

  protected readonly weekDays = computed(() => buildWeekDays(this.store.focusedDate()));
  protected readonly dayViewDays = computed(() => [this.store.focusedDate()]);

  protected readonly modalState = signal<ModalState | null>(null);

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
}
