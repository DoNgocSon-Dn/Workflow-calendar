import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CalendarStore } from '../../data/calendar-store';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Note } from '../../models/calendar.models';

/**
 * "Thùng rác ghi chú" — ghi chú bị xoá không mất ngay mà nằm ở đây, khôi phục
 * lại được hoặc xoá vĩnh viễn. Song song với `TrashModal` của sự kiện; tách
 * riêng vì dữ liệu và hành động khác hẳn (ghi chú không có mốc thời gian).
 */
@Component({
  selector: 'app-notes-trash-modal',
  templateUrl: './notes-trash-modal.html',
  styleUrl: './notes-trash-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotesTrashModal {
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

  readonly items = signal<Note[]>([]);
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
      this.items.set(await this.store.listTrashedNotes());
    } catch {
      this.error.set(this.i18n.t('trash.loadError'));
    } finally {
      this.loading.set(false);
    }
  }

  deletedAtLabel(note: Note): string {
    return note.deletedAt ? this.dateTime().format(note.deletedAt) : '';
  }

  async restore(id: string): Promise<void> {
    this.busyId.set(id);
    try {
      await this.store.restoreNote(id);
      this.items.update((list) => list.filter((n) => n.id !== id));
    } catch {
      this.error.set(this.i18n.t('trash.restoreError'));
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
      await this.store.permanentlyDeleteNote(id);
      this.items.update((list) => list.filter((n) => n.id !== id));
    } catch {
      this.error.set(this.i18n.t('trash.deleteError'));
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
