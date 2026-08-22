import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CalendarEvent } from '../../models/calendar.models';

/**
 * Read-only info card shown when the user clicks a Vietnam holiday entry.
 * Holidays are static reference data (see `data/vietnam-holidays.ts`), not
 * real events, so there is nothing to edit or delete here.
 */
@Component({
  selector: 'app-holiday-info-modal',
  templateUrl: './holiday-info-modal.html',
  styleUrl: './holiday-info-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HolidayInfoModal {
  readonly event = input.required<CalendarEvent>();
  readonly closed = output<void>();

  protected readonly displayDate = computed(() =>
    this.event().start.toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
  );

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
}
