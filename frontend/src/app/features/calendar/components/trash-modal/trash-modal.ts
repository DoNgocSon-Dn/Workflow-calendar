import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { CalendarStore } from '../../data/calendar-store';
import { CalendarEvent } from '../../models/calendar.models';

const DATE_TIME = new Intl.DateTimeFormat('vi-VN', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

@Component({
  selector: 'app-trash-modal',
  templateUrl: './trash-modal.html',
  styleUrl: './trash-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrashModal {
  private readonly store = inject(CalendarStore);

  readonly closed = output<void>();

  readonly items = signal<CalendarEvent[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly confirmingId = signal<string | null>(null);
  readonly busyId = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await this.store.listTrash());
    } catch {
      this.error.set('Không tải được thùng rác, vui lòng thử lại.');
    } finally {
      this.loading.set(false);
    }
  }

  eventRange(evt: CalendarEvent): string {
    return `${DATE_TIME.format(evt.start)} – ${DATE_TIME.format(evt.end)}`;
  }

  deletedAtLabel(evt: CalendarEvent): string {
    return evt.deletedAt ? DATE_TIME.format(evt.deletedAt) : '';
  }

  async restore(id: string): Promise<void> {
    this.busyId.set(id);
    try {
      await this.store.restoreEvent(id);
      this.items.update((list) => list.filter((e) => e.id !== id));
    } catch {
      this.error.set('Khôi phục thất bại, vui lòng thử lại.');
    } finally {
      this.busyId.set(null);
    }
  }

  requestPermanentDelete(id: string): void {
    if (this.confirmingId() === id) {
      void this.permanentDelete(id);
      return;
    }
    this.confirmingId.set(id);
  }

  private async permanentDelete(id: string): Promise<void> {
    this.busyId.set(id);
    try {
      await this.store.permanentlyDeleteEvent(id);
      this.items.update((list) => list.filter((e) => e.id !== id));
    } catch {
      this.error.set('Xoá vĩnh viễn thất bại, vui lòng thử lại.');
    } finally {
      this.confirmingId.set(null);
      this.busyId.set(null);
    }
  }

  cancel(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }
}
