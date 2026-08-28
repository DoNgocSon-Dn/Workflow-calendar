import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CalendarStore } from '../../data/calendar-store';
import { ScreenNotesService } from '../../data/screen-notes.service';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { NOTE_COLOR_HEX, Note } from '../../models/calendar.models';
import { Icon } from '../../../../shared/components/icon/icon';

/** Bảng màu ghi chú — trùng khoá với `NOTE_COLOR_HEX` / backend `NOTE_COLORS`. */
const PALETTE = ['yellow', 'blue', 'green', 'pink', 'purple'] as const;

/** Phần API Document Picture-in-Picture mà component dùng — không có sẵn trong
 *  lib.dom.d.ts của TS hiện tại. */
interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

function getDocumentPip(): DocumentPictureInPicture | null {
  const dpip = (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture })
    .documentPictureInPicture;
  return dpip ?? null;
}

/** Nhân bản mọi <style>/<link rel=stylesheet> sang cửa sổ PiP để thẻ ghi chú
 *  giữ nguyên giao diện khi bị chuyển sang document khác. */
function copyStylesTo(win: Window): void {
  for (const node of Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))) {
    win.document.head.appendChild(node.cloneNode(true));
  }
}

interface DragState {
  readonly id: string;
  readonly dx: number;
  readonly dy: number;
}

interface PipReturn {
  readonly el: HTMLElement;
  readonly anchor: Comment;
}

/**
 * Lớp phủ những ghi chú đã được "xé" khỏi sidebar và dán nổi lên màn hình —
 * mỗi cái là một thẻ giấy kéo-thả được, luôn nằm trên nội dung lịch, nhớ vị
 * trí qua `ScreenNotesService`. Sửa nội dung/đổi màu tại chỗ (ghi thẳng qua
 * `CalendarStore`, đồng bộ với sidebar và Trợ lý AI). Nút "mở cửa sổ nổi" đẩy
 * một thẻ ra cửa sổ luôn-trên-cùng thật sự của hệ điều hành (Document
 * Picture-in-Picture) ở trình duyệt có hỗ trợ.
 */
@Component({
  selector: 'app-screen-notes',
  templateUrl: './screen-notes.html',
  styleUrl: './screen-notes.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: {
    // Cửa sổ co lại thì kéo mọi tờ về trong tầm với, đừng để tờ nào kẹt ngoài mép.
    '(window:resize)': 'screen.rescueAll()',
  },
})
export class ScreenNotes {
  protected readonly store = inject(CalendarStore);
  protected readonly screen = inject(ScreenNotesService);
  protected readonly i18n = inject(TranslationService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  protected readonly palette = PALETTE;
  protected readonly pipSupported = !!getDocumentPip();

  protected readonly screenNotes = computed(() =>
    this.store.notes().filter((n) => this.screen.pinnedIds().has(n.id)),
  );

  protected readonly draggingId = signal<string | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly draft = signal('');
  protected readonly colorPickerId = signal<string | null>(null);
  protected readonly poppedOutId = signal<string | null>(null);

  private drag: DragState | null = null;
  private pipReturn: PipReturn | null = null;

  constructor() {
    // Ghi chú bị xoá ở nơi khác thì cũng thôi dán lên màn hình — dọn khi danh
    // sách từ server đã tải xong.
    effect(() => {
      if (!this.store.notesLoaded()) return;
      this.screen.reconcile(new Set(this.store.notes().map((n) => n.id)));
    });
  }

  protected tint(color: string): string {
    return NOTE_COLOR_HEX[color] ?? NOTE_COLOR_HEX['yellow'];
  }

  /** Góc nghiêng "dán vội bằng tay" cho mỗi tờ — suy ra từ id nên cố định qua
   *  các lần vẽ lại, nhưng giữa các tờ thì lệch nhau. */
  private readonly tiltCache = new Map<string, string>();

  protected tilt(noteId: string): string {
    const cached = this.tiltCache.get(noteId);
    if (cached) return cached;
    let h = 5381;
    for (let i = 0; i < noteId.length; i++) h = ((h << 5) + h + noteId.charCodeAt(i)) >>> 0;
    const deg = (((h % 900) / 100) - 4.5).toFixed(2); // -4.5deg .. 4.5deg
    const value = `${deg}deg`;
    this.tiltCache.set(noteId, value);
    return value;
  }

  protected leftOf(noteId: string): number {
    return this.screen.positionOf(noteId)?.x ?? 0;
  }

  protected topOf(noteId: string): number {
    return this.screen.positionOf(noteId)?.y ?? 0;
  }

  // --- Kéo-thả ----------------------------------------------------------

  onDragStart(event: PointerEvent, noteId: string): void {
    if (this.poppedOutId() === noteId) return;
    if ((event.target as HTMLElement).closest('button')) return;
    const pos = this.screen.positionOf(noteId);
    if (!pos) return;
    this.drag = { id: noteId, dx: event.clientX - pos.x, dy: event.clientY - pos.y };
    this.draggingId.set(noteId);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  onDragMove(event: PointerEvent): void {
    if (!this.drag) return;
    this.screen.setPosition(this.drag.id, event.clientX - this.drag.dx, event.clientY - this.drag.dy, {
      persist: false,
    });
  }

  onDragEnd(): void {
    if (!this.drag) return;
    this.drag = null;
    this.draggingId.set(null);
    this.screen.commit();
  }

  // --- Sửa nội dung ---------------------------------------------------

  startEdit(note: Note): void {
    this.colorPickerId.set(null);
    this.draft.set(note.content);
    this.editingId.set(note.id);
    setTimeout(() => {
      this.host.nativeElement
        .querySelector<HTMLTextAreaElement>(`.sticky[data-note-id="${note.id}"] .edit-area`)
        ?.focus();
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  async saveEdit(note: Note): Promise<void> {
    if (this.editingId() !== note.id) return;
    const next = this.draft().trim();
    this.editingId.set(null);
    if (!next || next === note.content) return;
    try {
      await this.store.updateNote(note.id, { content: next });
    } catch {
      // updateNote đã tự hoàn tác optimistic update khi lỗi.
    }
  }

  // --- Màu ------------------------------------------------------------

  toggleColorPicker(noteId: string): void {
    this.colorPickerId.update((curr) => (curr === noteId ? null : noteId));
  }

  async setColor(note: Note, color: string): Promise<void> {
    this.colorPickerId.set(null);
    if (color === note.color) return;
    try {
      await this.store.updateNote(note.id, { color });
    } catch {
      // Bỏ qua — optimistic update tự lùi lại.
    }
  }

  // --- Bỏ dán -------------------------------------------------------

  unpin(noteId: string): void {
    if (this.poppedOutId() === noteId) return;
    this.screen.unpin(noteId);
  }

  // --- Cửa sổ nổi luôn-trên-cùng (Document Picture-in-Picture) --------

  async popOut(noteId: string): Promise<void> {
    const dpip = getDocumentPip();
    if (!dpip || this.poppedOutId()) return;

    const card = this.host.nativeElement.querySelector<HTMLElement>(
      `.sticky[data-note-id="${noteId}"]`,
    );
    if (!card) return;

    let pip: Window;
    try {
      pip = await dpip.requestWindow({ width: 260, height: 220 });
    } catch {
      return; // Người dùng từ chối, hoặc không bật được.
    }

    copyStylesTo(pip);
    Object.assign(pip.document.body.style, {
      margin: '0',
      display: 'flex',
      background: 'transparent',
      overflow: 'hidden',
    });

    const anchor = document.createComment('screen-note-popped');
    card.replaceWith(anchor);
    card.classList.add('in-pip');
    pip.document.body.append(card);

    this.poppedOutId.set(noteId);
    this.pipReturn = { el: card, anchor };
    pip.addEventListener('pagehide', () => this.restoreFromPip(), { once: true });
  }

  private restoreFromPip(): void {
    const ret = this.pipReturn;
    this.pipReturn = null;
    this.poppedOutId.set(null);
    if (!ret) return;
    ret.el.classList.remove('in-pip');
    ret.anchor.replaceWith(ret.el);
  }
}
