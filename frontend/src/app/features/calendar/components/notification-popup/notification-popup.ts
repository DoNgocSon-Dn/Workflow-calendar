import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { NotificationQueue } from '../../../../core/realtime/notification-queue';

interface SnoozeOption {
  readonly minutes: number;
  readonly label: string;
}

const SNOOZE_OPTIONS: readonly SnoozeOption[] = [
  { minutes: 5, label: '5 phút' },
  { minutes: 10, label: '10 phút' },
  { minutes: 30, label: '30 phút' },
  { minutes: 60, label: '1 giờ' },
];

/** Phải khớp thời lượng animation `toastOut` trong CSS — card chỉ bị gỡ khỏi
 *  hàng đợi sau khi đã lùi hẳn vào chiều sâu, nếu không nó biến mất đột ngột. */
const EXIT_MS = 420;

/** Trễ thêm một nhịp để micro-feedback (card nhún / icon xác nhận) kịp chạy
 *  trước khi bắt đầu exit. */
const FEEDBACK_MS = 160;

@Component({
  selector: 'app-notification-popup',
  templateUrl: './notification-popup.html',
  styleUrl: './notification-popup.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'closeSnoozeMenu()',
  },
})
export class NotificationPopup {
  protected readonly notificationQueue = inject(NotificationQueue);

  readonly viewDetail = output<string>();

  protected readonly snoozeOptions = SNOOZE_OPTIONS;

  /** Id toast đang mở menu hoãn. Mở menu cũng phải GIỮ đồng hồ lại, không thì
   *  card tự tắt ngay lúc người dùng đang chọn thời lượng. */
  protected readonly snoozeMenuFor = signal<string | null>(null);

  /** Toast đang chạy animation rời đi — đã quyết định tắt nhưng chưa gỡ khỏi
   *  hàng đợi. */
  protected readonly leavingIds = signal<ReadonlySet<string>>(new Set());

  /** Toast vừa được bấm hành động — dùng cho micro-feedback trước khi rời đi. */
  protected readonly confirmingIds = signal<ReadonlySet<string>>(new Set());

  protected isLeaving(id: string): boolean {
    return this.leavingIds().has(id);
  }

  protected isConfirming(id: string): boolean {
    return this.confirmingIds().has(id);
  }

  /** Thanh progress chạy hết = hết thời gian hiển thị. Dùng chính animation CSS
   *  làm đồng hồ nên hover tạm dừng là đồng hồ dừng theo, không phải tự cộng
   *  trừ thời gian đã trôi ở TypeScript. */
  onProgressEnd(id: string): void {
    if (this.isLeaving(id)) return;
    this.beginExit(id, () => this.notificationQueue.dismiss(id));
  }

  /** Link tự mở ở tab mới (thẻ <a> lo), việc ở đây chỉ là dọn toast đi — đã
   *  vào họp rồi thì lời nhắc không còn gì để nhắc. */
  onJoinMeeting(notificationId: string): void {
    this.beginExit(notificationId, () => this.notificationQueue.dismiss(notificationId));
  }

  onViewDetail(eventId: string, notificationId: string): void {
    // Điều hướng chạy ngay, còn card rời đi theo nhịp của nó.
    this.viewDetail.emit(eventId);
    this.beginExit(notificationId, () => this.notificationQueue.dismiss(notificationId));
  }

  dismiss(id: string): void {
    this.closeSnoozeMenu();
    this.beginExit(id, () => this.notificationQueue.dismiss(id));
  }

  snooze(id: string, minutes: number): void {
    this.closeSnoozeMenu();
    this.beginExit(id, () => this.notificationQueue.snooze(id, minutes));
  }

  toggleSnoozeMenu(id: string): void {
    this.snoozeMenuFor.update((current) => (current === id ? null : id));
  }

  closeSnoozeMenu(): void {
    this.snoozeMenuFor.set(null);
  }

  /** Nhún nhẹ để xác nhận đã nhận lệnh → lùi vào chiều sâu → mới thực sự gỡ. */
  private beginExit(id: string, commit: () => void): void {
    if (this.isLeaving(id)) return;

    this.confirmingIds.update((set) => new Set(set).add(id));

    setTimeout(() => {
      this.confirmingIds.update((set) => this.without(set, id));
      this.leavingIds.update((set) => new Set(set).add(id));

      setTimeout(() => {
        commit();
        this.leavingIds.update((set) => this.without(set, id));
      }, EXIT_MS);
    }, FEEDBACK_MS);
  }

  private without(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
    const next = new Set(set);
    next.delete(id);
    return next;
  }
}
