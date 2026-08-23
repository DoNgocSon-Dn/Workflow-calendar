import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NotificationService } from '../../../core/services/notification.service';
import { CalendarStore } from '../../../features/calendar/data/calendar-store';
import { NotificationPanel, OpenGroupChatRequest } from './notification-panel';

@Component({
  selector: 'app-notification-button',
  templateUrl: './notification-button.html',
  styleUrl: './notification-button.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NotificationPanel],
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class NotificationButton {
  private readonly service = inject(NotificationService);
  private readonly calendarStore = inject(CalendarStore);

  readonly openEvent = output<string>();
  readonly openGroup = output<OpenGroupChatRequest>();

  protected readonly open = signal(false);

  /** Thông báo chưa đọc + lời mời tham gia lịch đang chờ — gộp về một chuông
   *  duy nhất thay vì hai icon riêng. */
  private readonly totalUnread = computed(
    () => this.service.unreadCount() + this.calendarStore.pendingInvites().length,
  );

  protected readonly badgeLabel = computed<string | null>(() => {
    const count = this.totalUnread();
    if (count <= 0) return null;
    return count > 99 ? '99+' : String(count);
  });

  /** Bật trong chốc lát khi số chưa đọc tăng, để chuông rung nhẹ một nhịp. */
  protected readonly pulsing = signal(false);

  private previousUnread = this.totalUnread();
  private pulseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const count = this.totalUnread();
      untracked(() => {
        if (count > this.previousUnread) this.triggerPulse();
        this.previousUnread = count;
      });
    });
  }

  private triggerPulse(): void {
    this.pulsing.set(true);
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    this.pulseTimer = setTimeout(() => this.pulsing.set(false), 600);
  }

  toggle(): void {
    this.open.update((value) => !value);
  }

  closePanel(): void {
    this.open.set(false);
  }

  onEscape(): void {
    if (this.open()) this.closePanel();
  }

  onOpenEvent(eventId: string): void {
    this.openEvent.emit(eventId);
  }

  onOpenGroup(request: OpenGroupChatRequest): void {
    this.openGroup.emit(request);
  }
}
