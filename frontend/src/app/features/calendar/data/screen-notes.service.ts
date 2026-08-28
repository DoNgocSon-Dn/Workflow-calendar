import { Injectable, computed, signal } from '@angular/core';

/** Vị trí (px, gốc trên-trái viewport) của một ghi chú đã "xé dán" lên màn hình. */
export interface ScreenNotePos {
  readonly x: number;
  readonly y: number;
}

const STORAGE_KEY = 'screen-pinned-notes-v1';
/** Bề ngang thẻ ghi chú nổi — khớp `.sticky` trong screen-notes.css. */
const CARD_W = 232;
/** Kéo đi đâu cũng được, KHÔNG ràng buộc — nhưng luôn chừa lại chừng này pixel
 *  của thanh kéo trong viewport để tờ giấy không bao giờ mất hẳn ngoài mép,
 *  không tài nào tóm lại được. Đây là mức tối thiểu duy nhất còn giữ. */
const MIN_VISIBLE = 34;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Giữ tờ giấy nằm trong tầm với: cho phép thò ra gần hết mọi phía, chỉ chặn
 *  đúng lúc nó sắp trôi ra khỏi màn hình hoàn toàn. */
function keepReachable(pos: ScreenNotePos): ScreenNotePos {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const h = typeof window !== 'undefined' ? window.innerHeight : 800;
  return {
    x: clamp(pos.x, -(CARD_W - MIN_VISIBLE), w - MIN_VISIBLE),
    // Không cho mép trên (chỗ có thanh kéo) chui lên trên viewport, còn lại thả tự do.
    y: clamp(pos.y, 0, Math.max(0, h - MIN_VISIBLE)),
  };
}

function readStored(): Record<string, ScreenNotePos> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<ScreenNotePos>>;
    const out: Record<string, ScreenNotePos> = {};
    for (const [id, pos] of Object.entries(parsed)) {
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        // Màn hình lần này có thể nhỏ hơn lần trước — kéo mọi tờ về lại trong tầm.
        out[id] = keepReachable({ x: pos.x, y: pos.y });
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

  /** Dán một ghi chú lên màn hình. Có `pos` (kéo-thả) thì đặt ngay tại chỗ
   *  thả; không thì xếp bậc thang từ góc trên-phải cho khỏi chồng khít. Sau
   *  đó kéo đi đâu tuỳ ý. */
  pin(noteId: string, pos?: ScreenNotePos): void {
    if (this.isPinned(noteId)) return;
    const place = pos ? keepReachable(pos) : this.nextSlot(Object.keys(this.positions()).length);
    this.positions.update((map) => ({ ...map, [noteId]: place }));
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
   *  trỏ; gọi `commit()` một lần lúc thả để ghi xuống localStorage.
   *
   *  Không ràng buộc vùng thả: tờ giấy đi tới bất kỳ đâu trên màn hình, chỉ
   *  `keepReachable` chặn đúng trường hợp nó sắp biến mất hẳn ngoài mép. */
  setPosition(noteId: string, x: number, y: number, opts: { persist?: boolean } = {}): void {
    if (!this.isPinned(noteId)) return;
    const next = keepReachable({ x, y });
    this.positions.update((map) => ({ ...map, [noteId]: next }));
    if (opts.persist !== false) this.persist();
  }

  commit(): void {
    this.persist();
  }

  /** Kéo mọi tờ đang dán về lại trong tầm với — gọi khi cửa sổ đổi kích thước
   *  để không có tờ nào kẹt ngoài viewport mới. */
  rescueAll(): void {
    let changed = false;
    const next: Record<string, ScreenNotePos> = {};
    for (const [id, pos] of Object.entries(this.positions())) {
      const fixed = keepReachable(pos);
      if (fixed.x !== pos.x || fixed.y !== pos.y) changed = true;
      next[id] = fixed;
    }
    if (!changed) return;
    this.positions.set(next);
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
    const w = window.innerWidth;
    const step = 28;
    const wrapped = index % 6;
    return keepReachable({
      x: w - CARD_W - 32 - wrapped * step,
      y: 88 + wrapped * step,
    });
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
