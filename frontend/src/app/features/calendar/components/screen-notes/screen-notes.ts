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
import { DialogService } from '../../../../core/services/dialog.service';
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
    // Kéo một ghi chú từ sidebar rồi thả ra VÙNG TRỐNG bất kỳ trên màn hình →
    // dán thành tờ giấy nổi ngay tại chỗ thả. (Thả trúng ô ngày trên lịch thì
    // ô đó đã tự xử lý + stopPropagation nên không tới được đây.)
    '(document:dragover)': 'onDocDragOver($event)',
    '(document:drop)': 'onDocDrop($event)',
  },
})
export class ScreenNotes {
  protected readonly store = inject(CalendarStore);
  protected readonly screen = inject(ScreenNotesService);
  private readonly dialog = inject(DialogService);
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

  // --- Kéo từ sidebar ra màn hình (HTML5 drag) -------------------------

  private isNoteDrag(event: DragEvent): boolean {
    return !!event.dataTransfer?.types.includes('application/x-note-id');
  }

  /** Thả lại vào thanh bên = không dán ra màn hình (ghi chú vốn từ đó kéo ra). */
  private overSidebar(event: DragEvent): boolean {
    return !!(event.target as HTMLElement | null)?.closest('app-calendar-sidebar');
  }

  onDocDragOver(event: DragEvent): void {
    if (!this.isNoteDrag(event) || this.overSidebar(event)) return;
    // Mặc định trình duyệt CẤM thả — phải chặn ở dragover thì `drop` mới bắn.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  onDocDrop(event: DragEvent): void {
    if (!this.isNoteDrag(event) || this.overSidebar(event)) return;
    const noteId = event.dataTransfer?.getData('application/x-note-id');
    if (!noteId) return;
    event.preventDefault();
    // Đặt mép trên–trái tờ giấy sao cho con trỏ rơi vào gần góc trên của nó.
    const x = event.clientX - 24;
    const y = event.clientY - 12;
    // HOÃN tới khi thao tác kéo đã kết thúc hẳn: pin() khiến `.note-item` nguồn
    // biến khỏi sidebar NGAY, làm `dragend` bắn trên một node đã lìa DOM (không
    // nổi bọt lên document để dọn viền vàng), và trình duyệt có thể để lại
    // "ảnh kéo" mờ dính trên màn hình. Chờ một nhịp là hết cả hai.
    setTimeout(() => this.screen.pin(noteId, { x, y }), 0);
  }

  // --- Kéo tờ giấy nổi trên màn hình (pointer) -------------------------

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

  onDragEnd(event: PointerEvent): void {
    if (!this.drag) return;
    const id = this.drag.id;
    this.drag = null;
    this.draggingId.set(null);

    // Thả tờ giấy TRỞ LẠI thanh bên → cất nó đi (gỡ khỏi màn hình), ghi chú
    // hiện lại trong danh sách. Kiểm bằng toạ độ vùng thanh bên chứ không
    // dùng elementFromPoint — chỗ đó chính tờ giấy đang che nên sẽ trả về nó.
    const rect = document.querySelector('app-calendar-sidebar')?.getBoundingClientRect();
    const overSidebar =
      !!rect &&
      rect.width > 0 &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (overSidebar) {
      this.screen.unpin(id);
      return;
    }
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

  // --- Bỏ dán / xóa ------------------------------------------------

  /** GỠ tờ giấy khỏi màn hình — nội dung vẫn còn trong danh sách ghi chú. */
  unpin(noteId: string): void {
    if (this.poppedOutId() === noteId) return;
    this.screen.unpin(noteId);
  }

  protected readonly deletingId = signal<string | null>(null);

  /** XÓA hẳn ghi chú — hỏi xác nhận, rồi vào Thùng rác ghi chú. Tờ giấy cũng
   *  biến mất khỏi màn hình (store cập nhật notes → reconcile gỡ ghim). */
  async requestDelete(note: Note): Promise<void> {
    if (this.poppedOutId() === note.id || this.deletingId()) return;
    const ok = await this.dialog.confirm(this.i18n.t('note.deleteBody'), {
      title: this.i18n.t('sidebar.deleteNoteTitle'),
      confirmLabel: this.i18n.t('sidebar.deleteNoteConfirm'),
      danger: true,
    });
    if (!ok) return;
    this.deletingId.set(note.id);
    try {
      await this.store.deleteNote(note.id);
    } catch {
      await this.dialog.alert(this.i18n.t('sidebar.deleteNoteError'));
    } finally {
      this.deletingId.set(null);
    }
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
