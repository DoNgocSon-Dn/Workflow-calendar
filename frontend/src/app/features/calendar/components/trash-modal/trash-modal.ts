import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CalendarStore } from '../../data/calendar-store';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { CalendarEvent } from '../../models/calendar.models';

@Component({
  selector: 'app-trash-modal',
  templateUrl: './trash-modal.html',
  styleUrl: './trash-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrashModal {
  private readonly store = inject(CalendarStore);
  protected readonly i18n = inject(TranslationService);

  private readonly dateTime = computed(
    () =>
      new Intl.DateTimeFormat(this.i18n.t('common.dateLocale'), {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
  );

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
      this.error.set(this.i18n.t("trash.loadError"));
    } finally {
      this.loading.set(false);
    }
  }

  eventRange(evt: CalendarEvent): string {
    return `${this.dateTime().format(evt.start)} – ${this.dateTime().format(evt.end)}`;
  }

  deletedAtLabel(evt: CalendarEvent): string {
    return evt.deletedAt ? this.dateTime().format(evt.deletedAt) : '';
  }

  async restore(id: string): Promise<void> {
    this.busyId.set(id);
    try {
      await this.store.restoreEvent(id);
      this.items.update((list) => list.filter((e) => e.id !== id));
    } catch {
      this.error.set(this.i18n.t("trash.restoreError"));
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
      this.error.set(this.i18n.t("trash.deleteError"));
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
