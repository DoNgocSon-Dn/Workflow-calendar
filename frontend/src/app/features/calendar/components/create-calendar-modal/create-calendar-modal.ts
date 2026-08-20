import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { CalendarStore } from '../../data/calendar-store';
import { CALENDAR_COLOR_HEX, CalendarColor } from '../../models/calendar.models';

const CALENDAR_COLORS = Object.keys(CALENDAR_COLOR_HEX) as CalendarColor[];

@Component({
  selector: 'app-create-calendar-modal',
  templateUrl: './create-calendar-modal.html',
  styleUrl: './create-calendar-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateCalendarModal {
  private readonly store = inject(CalendarStore);

  protected readonly colorHex = CALENDAR_COLOR_HEX;
  protected readonly colors = CALENDAR_COLORS;

  readonly created = output<{ calendarId: string; calendarName: string }>();
  readonly closed = output<void>();

  protected readonly name = signal('');
  protected readonly color = signal<CalendarColor>('blue');
  protected readonly creating = signal(false);
  protected readonly error = signal<string | null>(null);

  setColor(color: CalendarColor): void {
    this.color.set(color);
  }

  async create(): Promise<void> {
    const name = this.name().trim();
    if (!name || this.creating()) return;

    this.creating.set(true);
    this.error.set(null);
    try {
      const calendar = await this.store.createCalendar(name, this.color());
      this.created.emit({ calendarId: calendar.id, calendarName: calendar.name });
      this.closed.emit();
    } catch {
      this.error.set('Không thể tạo lịch nhóm. Vui lòng thử lại.');
    } finally {
      this.creating.set(false);
    }
  }

  cancel(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }
}
