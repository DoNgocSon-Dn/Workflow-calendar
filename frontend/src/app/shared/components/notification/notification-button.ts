import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NotificationService } from '../../../core/services/notification.service';
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

  readonly openEvent = output<string>();
  readonly openGroup = output<OpenGroupChatRequest>();

  protected readonly open = signal(false);
  protected readonly badgeLabel = this.service.unreadBadgeLabel;
  /** Bật trong chốc lát khi số chưa đọc tăng, để chuông rung nhẹ một nhịp. */
  protected readonly pulsing = signal(false);

  private previousUnread = this.service.unreadCount();
  private pulseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const count = this.service.unreadCount();
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
