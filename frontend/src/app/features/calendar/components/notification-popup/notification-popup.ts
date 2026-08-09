import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { NotificationQueue } from '../../../../core/realtime/notification-queue';

@Component({
  selector: 'app-notification-popup',
  templateUrl: './notification-popup.html',
  styleUrl: './notification-popup.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationPopup {
  protected readonly notificationQueue = inject(NotificationQueue);

  readonly viewDetail = output<string>();

  onViewDetail(eventId: string, notificationId: string): void {
    this.viewDetail.emit(eventId);
    this.notificationQueue.dismiss(notificationId);
  }

  dismiss(id: string): void {
    this.notificationQueue.dismiss(id);
  }

  snooze(id: string): void {
    this.notificationQueue.snooze(id);
  }
}
