import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthStore } from '../../core/auth/auth-store';
import { CalendarStore } from '../calendar/data/calendar-store';
import { Note } from '../calendar/models/calendar.models';

const NOTE_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple'] as const;
type NoteColor = (typeof NOTE_COLORS)[number];

@Component({
  selector: 'app-notes-widget',
  templateUrl: './notes-widget.html',
  styleUrl: './notes-widget.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class NotesWidget {
  private readonly store = inject(CalendarStore);
  private readonly authStore = inject(AuthStore);

  readonly noteColors = NOTE_COLORS;
  readonly open = signal(false);
  readonly notes = signal<Note[]>([]);
  readonly newNoteContent = signal('');
  readonly newNoteColor = signal<NoteColor>('yellow');
  readonly saving = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly editingContent = signal('');

  constructor() {
    effect(() => {
      if (this.authStore.user()) {
        void this.load();
      } else {
        this.notes.set([]);
      }
    });
  }

  private async load(): Promise<void> {
    try {
      this.notes.set(await this.store.listNotes());
    } catch {
      this.notes.set([]);
    }
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  async addNote(): Promise<void> {
    const content = this.newNoteContent().trim();
    if (!content) return;
    this.saving.set(true);
    try {
      const note = await this.store.createNote(content, this.newNoteColor());
      this.notes.update((list) => [note, ...list]);
      this.newNoteContent.set('');
    } finally {
      this.saving.set(false);
    }
  }

  startEdit(note: Note): void {
    this.editingId.set(note.id);
    this.editingContent.set(note.content);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.editingContent.set('');
  }

  async saveEdit(id: string): Promise<void> {
    const content = this.editingContent().trim();
    if (!content) return;
    const updated = await this.store.updateNote(id, { content });
    this.notes.update((list) => list.map((n) => (n.id === id ? updated : n)));
    this.cancelEdit();
  }

  async remove(id: string): Promise<void> {
    await this.store.deleteNote(id);
    this.notes.update((list) => list.filter((n) => n.id !== id));
  }
}
