import { Injectable, computed, signal } from '@angular/core';

/** Vị trí (px, gốc trên-trái viewport) của một ghi chú đã "xé dán" lên màn hình. */
export interface ScreenNotePos {
  readonly x: number;
  readonly y: number;
}

const STORAGE_KEY = 'screen-pinned-notes-v1';
/** Bề ngang thẻ ghi chú nổi — khớp `.sticky` trong screen-notes.css. */
const CARD_W = 232;
const CARD_H = 176;
const EDGE = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readStored(): Record<string, ScreenNotePos> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<ScreenNotePos>>;
    const out: Record<string, ScreenNotePos> = {};
    for (const [id, pos] of Object.entries(parsed)) {
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        out[id] = { x: pos.x, y: pos.y };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Theo dõi những ghi chú người dùng đã "xé" khỏi sidebar và dán nổi lên màn
 * hình — id nào đang dán, và mỗi cái nằm ở toạ độ nào. Chỉ là trạng thái phía
 * client (lưu localStorage), không đụng tới backend: một ghi chú bị bỏ dán vẫn
 * còn nguyên trong danh sách, chỉ là thôi nổi lên trên.
 */
@Injectable({ providedIn: 'root' })
export class ScreenNotesService {
  private readonly positions = signal<Record<string, ScreenNotePos>>(readStored());

  /** Tập id ghi chú đang được dán lên màn hình. */
  readonly pinnedIds = computed(() => new Set(Object.keys(this.positions())));

  isPinned(noteId: string): boolean {
    return noteId in this.positions();
  }

  positionOf(noteId: string): ScreenNotePos | undefined {
    return this.positions()[noteId];
  }

  /** Dán một ghi chú lên màn hình. Thẻ mới xếp bậc thang từ góc trên-phải để
   *  không chồng khít lên thẻ đã có. */
  pin(noteId: string): void {
    if (this.isPinned(noteId)) return;
    this.positions.update((map) => ({ ...map, [noteId]: this.nextSlot(Object.keys(map).length) }));
    this.persist();
  }

  unpin(noteId: string): void {
    if (!this.isPinned(noteId)) return;
    this.positions.update((map) => {
      const next = { ...map };
      delete next[noteId];
      return next;
    });
    this.persist();
  }

  toggle(noteId: string): void {
    this.isPinned(noteId) ? this.unpin(noteId) : this.pin(noteId);
  }

  /** `persist: false` khi đang kéo — chỉ cập nhật signal để thẻ chạy theo con
   *  trỏ; gọi `commit()` một lần lúc thả để ghi xuống localStorage. */
  setPosition(noteId: string, x: number, y: number, opts: { persist?: boolean } = {}): void {
    if (!this.isPinned(noteId)) return;
    const clamped: ScreenNotePos = {
      x: clamp(x, EDGE, Math.max(EDGE, window.innerWidth - CARD_W - EDGE)),
      y: clamp(y, EDGE, Math.max(EDGE, window.innerHeight - CARD_H - EDGE)),
    };
    this.positions.update((map) => ({ ...map, [noteId]: clamped }));
    if (opts.persist !== false) this.persist();
  }

  commit(): void {
    this.persist();
  }

  /** Gỡ khỏi màn hình những id không còn là ghi chú thật (đã bị xoá ở nơi
   *  khác) — gọi sau khi danh sách ghi chú từ server đã tải xong. */
  reconcile(existingIds: ReadonlySet<string>): void {
    const stale = Object.keys(this.positions()).filter((id) => !existingIds.has(id));
    if (!stale.length) return;
    this.positions.update((map) => {
      const next = { ...map };
      for (const id of stale) delete next[id];
      return next;
    });
    this.persist();
  }

  private nextSlot(index: number): ScreenNotePos {
    const baseX = Math.max(EDGE, window.innerWidth - CARD_W - EDGE * 2);
    const step = 26;
    const wrapped = index % 6;
    return {
      x: clamp(baseX - wrapped * step, EDGE, window.innerWidth - CARD_W - EDGE),
      y: clamp(88 + wrapped * step, EDGE, Math.max(EDGE, window.innerHeight - CARD_H - EDGE)),
    };
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.positions()));
    } catch {
      // Private mode / quota — trạng thái vẫn đúng trong phiên này, chỉ là
      // không nhớ được sau khi tải lại.
    }
  }
}
