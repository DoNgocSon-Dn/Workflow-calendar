import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AuthStore } from '../../../core/auth/auth-store';
import { AiChatHistoryEntry, CalendarStore } from '../../../features/calendar/data/calendar-store';
import { Note, Todo } from '../../../features/calendar/models/calendar.models';

/** Số lượt chat gần nhất gửi kèm lên backend làm ngữ cảnh — đủ để AI hiểu các
 *  câu hỏi tiếp nối ("còn ngày mai thì sao?") mà không làm phình prompt. */
const CHAT_HISTORY_TURNS = 10;

/**
 * One draggable floating bubble that combines the personal-notes widget and
 * the AI assistant widget — previously two separate FABs — behind a single
 * button with a tab switcher, movable anywhere on screen like a chat head.
 */

const NOTE_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple'] as const;
type NoteColor = (typeof NOTE_COLORS)[number];

type HubTab = 'notes' | 'todos' | 'ai';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  suggestManualForm?: boolean;
  guessedTitle?: string;
}

const POS_STORAGE_KEY = 'floating-hub-pos';
const FAB_SIZE = 52;
const EDGE_MARGIN = 24;
const PANEL_GAP = 12;
const DRAG_THRESHOLD_PX = 4;

interface HubPos {
  readonly x: number;
  readonly y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function defaultPos(): HubPos {
  return {
    x: window.innerWidth - FAB_SIZE - EDGE_MARGIN,
    y: window.innerHeight - FAB_SIZE - EDGE_MARGIN,
  };
}

function readStoredPos(): HubPos {
  try {
    const raw = localStorage.getItem(POS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HubPos>;
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        return {
          x: clamp(parsed.x, EDGE_MARGIN / 4, window.innerWidth - FAB_SIZE - EDGE_MARGIN / 4),
          y: clamp(parsed.y, EDGE_MARGIN / 4, window.innerHeight - FAB_SIZE - EDGE_MARGIN / 4),
        };
      }
    }
  } catch {
    // Ignore malformed/unavailable storage — fall back to the default corner.
  }
  return defaultPos();
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return 'Không kết nối được tới server, vui lòng kiểm tra lại và thử lại.';
    }
    const inner = err.error as { message?: string | string[] } | undefined;
    const msg = inner?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return 'Đã xảy ra lỗi, vui lòng thử lại.';
}

function isDeleteIntent(text: string): boolean {
  return /\b(xóa|xoá|hủy|huỷ)\b/i.test(text);
}

function formatDateLabel(date: Date): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);
  const absolute = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  if (diffDays === 0) return `Hôm nay (${absolute})`;
  if (diffDays === 1) return `Ngày mai (${absolute})`;
  return absolute;
}

function formatEventPreview(event: { title: string; start: string; end: string; location?: string }): string {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const invalid = Number.isNaN(start.getTime()) || Number.isNaN(end.getTime());
  const timeFmt = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });

  const lines = [
    `✓ Tiêu đề: ${event.title}`,
    `📅 Ngày: ${invalid ? event.start : formatDateLabel(start)}`,
    `🕘 Thời gian: ${invalid ? `${event.start} - ${event.end}` : `${timeFmt.format(start)} – ${timeFmt.format(end)}`}`,
  ];
  if (event.location) lines.push(`📍 Địa điểm: ${event.location}`);
  return lines.join('\n');
}

@Component({
  selector: 'app-floating-hub',
  templateUrl: './floating-hub.html',
  styleUrl: './floating-hub.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class FloatingHub {
  private readonly store = inject(CalendarStore);
  private readonly authStore = inject(AuthStore);

  protected readonly fabSize = FAB_SIZE;
  protected readonly panelGap = PANEL_GAP;

  readonly openManualForm = output<string>();

  // --- Bubble open state + drag-anywhere position ------------------------
  protected readonly open = signal(false);
  protected readonly activeTab = signal<HubTab>('notes');
  protected readonly pos = signal<HubPos>(readStoredPos());
  protected readonly dragging = signal(false);

  private dragStart: { pointerX: number; pointerY: number; fabX: number; fabY: number } | null = null;
  private movedDuringDrag = false;

  /** Which side of the bubble the panel should open on, so it always stays
   *  fully on-screen no matter where the bubble was dragged to. */
  protected readonly panelSide = computed(() => {
    const p = this.pos();
    const horizontal: 'left' | 'right' = p.x + FAB_SIZE / 2 > window.innerWidth / 2 ? 'left' : 'right';
    const vertical: 'up' | 'down' = p.y + FAB_SIZE / 2 > window.innerHeight / 2 ? 'up' : 'down';
    return { horizontal, vertical };
  });

  protected panelLeft(): number | null {
    return this.panelSide().horizontal === 'right' ? this.pos().x + FAB_SIZE + PANEL_GAP : null;
  }

  protected panelRight(): number | null {
    return this.panelSide().horizontal === 'left' ? window.innerWidth - this.pos().x + PANEL_GAP : null;
  }

  protected panelTop(): number | null {
    return this.panelSide().vertical === 'down' ? this.pos().y + FAB_SIZE + PANEL_GAP : null;
  }

  protected panelBottom(): number | null {
    return this.panelSide().vertical === 'up' ? window.innerHeight - this.pos().y + PANEL_GAP : null;
  }

  onFabPointerDown(event: PointerEvent): void {
    this.movedDuringDrag = false;
    const current = this.pos();
    this.dragStart = { pointerX: event.clientX, pointerY: event.clientY, fabX: current.x, fabY: current.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  onFabPointerMove(event: PointerEvent): void {
    const start = this.dragStart;
    if (!start) return;
    const dx = event.clientX - start.pointerX;
    const dy = event.clientY - start.pointerY;
    if (!this.movedDuringDrag && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    this.movedDuringDrag = true;
    this.dragging.set(true);
    this.pos.set({
      x: clamp(start.fabX + dx, 4, window.innerWidth - FAB_SIZE - 4),
      y: clamp(start.fabY + dy, 4, window.innerHeight - FAB_SIZE - 4),
    });
  }

  onFabPointerUp(): void {
    if (!this.dragStart) return;
    this.dragStart = null;
    this.dragging.set(false);
    if (this.movedDuringDrag) {
      try {
        localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(this.pos()));
      } catch {
        // Ignore write failures (private browsing quota, etc.).
      }
    } else {
      this.toggle();
    }
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  setTab(tab: HubTab): void {
    this.activeTab.set(tab);
  }

  // --- Notes tab (unchanged behavior, moved from NotesWidget) ------------
  readonly noteColors = NOTE_COLORS;
  protected readonly notes = signal<Note[]>([]);
  protected readonly newNoteContent = signal('');
  protected readonly newNoteColor = signal<NoteColor>('yellow');
  protected readonly savingNote = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly editingContent = signal('');

  constructor() {
    effect(() => {
      if (this.authStore.user()) {
        void this.loadNotes();
        void this.loadTodos();
      } else {
        this.notes.set([]);
        this.todos.set([]);
      }
    });
  }

  private async loadNotes(): Promise<void> {
    try {
      this.notes.set(await this.store.listNotes());
    } catch {
      this.notes.set([]);
    }
  }

  async addNote(): Promise<void> {
    const content = this.newNoteContent().trim();
    if (!content) return;
    this.savingNote.set(true);
    try {
      const note = await this.store.createNote(content, this.newNoteColor());
      this.notes.update((list) => [note, ...list]);
      this.newNoteContent.set('');
    } finally {
      this.savingNote.set(false);
    }
  }

  startEditNote(note: Note): void {
    this.editingId.set(note.id);
    this.editingContent.set(note.content);
  }

  cancelEditNote(): void {
    this.editingId.set(null);
    this.editingContent.set('');
  }

  async saveEditNote(id: string): Promise<void> {
    const content = this.editingContent().trim();
    if (!content) return;
    const updated = await this.store.updateNote(id, { content });
    this.notes.update((list) => list.map((n) => (n.id === id ? updated : n)));
    this.cancelEditNote();
  }

  async removeNote(id: string): Promise<void> {
    await this.store.deleteNote(id);
    this.notes.update((list) => list.filter((n) => n.id !== id));
  }

  // --- Todos tab (checklist, sibling of notes) ----------------------------
  protected readonly todos = signal<Todo[]>([]);
  protected readonly newTodoContent = signal('');
  protected readonly savingTodo = signal(false);
  protected readonly editingTodoId = signal<string | null>(null);
  protected readonly editingTodoContent = signal('');

  protected readonly pendingTodos = computed(() => this.todos().filter((t) => !t.done));
  protected readonly doneTodos = computed(() => this.todos().filter((t) => t.done));
  /** Chưa xong nổi lên trên, đã xong dồn xuống dưới sau một dòng phân cách —
   *  gộp thành 1 mảng để dùng chung 1 @for/@empty trong template. */
  protected readonly sortedTodos = computed(() => [...this.pendingTodos(), ...this.doneTodos()]);

  private async loadTodos(): Promise<void> {
    try {
      this.todos.set(await this.store.listTodos());
    } catch {
      this.todos.set([]);
    }
  }

  async addTodo(): Promise<void> {
    const content = this.newTodoContent().trim();
    if (!content) return;
    this.savingTodo.set(true);
    try {
      const todo = await this.store.createTodo(content);
      this.todos.update((list) => [todo, ...list]);
      this.newTodoContent.set('');
    } finally {
      this.savingTodo.set(false);
    }
  }

  async toggleTodo(todo: Todo): Promise<void> {
    const updated = await this.store.updateTodo(todo.id, { done: !todo.done });
    this.todos.update((list) => list.map((t) => (t.id === todo.id ? updated : t)));
  }

  startEditTodo(todo: Todo): void {
    this.editingTodoId.set(todo.id);
    this.editingTodoContent.set(todo.content);
  }

  cancelEditTodo(): void {
    this.editingTodoId.set(null);
    this.editingTodoContent.set('');
  }

  async saveEditTodo(id: string): Promise<void> {
    const content = this.editingTodoContent().trim();
    if (!content) return;
    const updated = await this.store.updateTodo(id, { content });
    this.todos.update((list) => list.map((t) => (t.id === id ? updated : t)));
    this.cancelEditTodo();
  }

  async removeTodo(id: string): Promise<void> {
    await this.store.deleteTodo(id);
    this.todos.update((list) => list.filter((t) => t.id !== id));
  }

  // --- AI chat tab (unchanged behavior, moved from AiChatWidget) ---------
  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly draft = signal('');
  protected readonly sending = signal(false);
  protected readonly aiError = signal<string | null>(null);
  private readonly lastCreatedEventId = signal<string | null>(null);

  readonly suggestions = [
    'Họp team 9h sáng mai',
    'Ăn tối 19:30 ngày mai',
    'Chạy bộ 6h sáng mai trong 30 phút',
    'Gặp đối tác thứ 2 tuần sau 14h',
  ];

  async send(): Promise<void> {
    const text = this.draft().trim();
    if (!text || this.sending()) return;

    const calendarId = this.store.calendars()[0]?.id;
    if (!calendarId) {
      this.aiError.set('Bạn chưa có lịch nào để tạo sự kiện.');
      return;
    }

    // Chụp lại lịch sử TRƯỚC khi thêm tin nhắn user hiện tại — tránh gửi trùng
    // câu vừa hỏi trong cả `message` lẫn `history`.
    const history: AiChatHistoryEntry[] = this.messages()
      .slice(-CHAT_HISTORY_TURNS * 2)
      .map((m) => ({ role: m.role, content: m.text }));

    this.pushMessage('user', text);
    this.draft.set('');
    this.sending.set(true);
    this.aiError.set(null);

    if (isDeleteIntent(text)) {
      await this.handleDeleteIntent();
      this.sending.set(false);
      return;
    }

    try {
      const result = await this.store.sendAiChat(text, calendarId, history);
      if (result.intent === 'create_event') {
        this.lastCreatedEventId.set(result.event.id);
        this.pushMessage('assistant', `Đã tạo sự kiện:\n${formatEventPreview(result.event)}`);
      } else if (result.intent === 'chat') {
        this.pushMessage('assistant', result.reply);
      } else {
        this.pushMessage(
          'assistant',
          'Mình chưa chắc chắn về thời gian trong câu này — hãy mở form để nhập tay nhé.',
          true,
          result.title,
        );
      }
    } catch (err) {
      this.aiError.set(extractErrorMessage(err));
    } finally {
      this.sending.set(false);
    }
  }

  private async handleDeleteIntent(): Promise<void> {
    const id = this.lastCreatedEventId();
    if (!id) {
      this.pushMessage(
        'assistant',
        'Mình chưa tạo sự kiện nào trong phiên chat này để xóa cả — bạn có thể xóa trực tiếp trên lịch nhé.',
      );
      return;
    }
    await this.store.deleteEvent(id);
    this.lastCreatedEventId.set(null);
    this.pushMessage('assistant', 'Đã xóa sự kiện vừa tạo.');
  }

  sendSuggestion(suggestion: string): void {
    this.draft.set(suggestion);
    this.send();
  }

  private pushMessage(
    role: ChatMessage['role'],
    text: string,
    suggestManualForm?: boolean,
    guessedTitle?: string,
  ): void {
    this.messages.update((list) => [
      ...list,
      { id: crypto.randomUUID(), role, text, suggestManualForm, guessedTitle },
    ]);
  }
}
