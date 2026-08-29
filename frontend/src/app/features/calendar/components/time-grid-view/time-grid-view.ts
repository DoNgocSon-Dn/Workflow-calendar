import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Clock } from '../../../../core/clock';
import { DialogService } from '../../../../core/services/dialog.service';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { TimeFormatService } from '../../../../core/time-format/time-format-service';
import { CreateRequest } from '../month-view/month-view';
import { CalendarStore } from '../../data/calendar-store';
import { CALENDAR_COLOR_HEX, CalendarEvent, NOTE_COLOR_HEX, Note } from '../../models/calendar.models';
import {
  addDays,
  addMinutes,
  clampToDay,
  diffMinutes,
  formatHourLabel,
  formatTimeLabel,
  isSameDay,
  minutesSinceMidnight,
  startOfDay,
  toDateInputValue,
  weekdayShort,
} from '../../utils/date-utils';
import { isEventOnDay } from '../../utils/event-utils';
import { PositionedEvent, layoutDayEvents } from '../../utils/time-grid-layout';

import { convertSolarToLunar, LunarDate, lunarCellLabel } from '../../utils/lunar-calendar';
import {
  resolveTopHolidayForDate,
  holidayCalendarType,
  holidayName,
} from '../../utils/holiday-resolver';
import { Holiday } from '../../../../models/holiday-theme.model';
import { VN_HOLIDAY_CALENDAR_ID } from '../../data/vietnam-holidays';

const HOUR_HEIGHT = 48;
const SNAP_MINUTES = 15;

interface DragCreateState {
  dayKey: string;
  startMin: number;
  endMin: number;
}

/**
 * Trạng thái đang KÉO một sự kiện. Tách rõ hai loại giá trị:
 *  - `dxPx`/`dyPx`: độ dời PIXEL thô — dùng cho `transform: translate()` để khối
 *    bám sát ngón tay từng frame, không snap, không re-layout ⇒ mượt.
 *  - `snapMin`/`snapDays`: giá trị đã snap 15 phút / theo cột — chỉ dùng cho
 *    nhãn giờ hiển thị và lúc thả ra để lưu.
 */
interface DragMoveState {
  eventId: string;
  dxPx: number;
  dyPx: number;
  snapMin: number;
  snapDays: number;
}

interface DragResizeState {
  eventId: string;
  edge: 'top' | 'bottom';
  dyPx: number;
  snapMin: number;
}

function snap(min: number): number {
  return Math.max(0, Math.min(1440, Math.round(min / SNAP_MINUTES) * SNAP_MINUTES));
}

@Component({
  selector: 'app-time-grid-view',
  templateUrl: './time-grid-view.html',
  styleUrl: './time-grid-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // Thả ghi chú ra ngoài cột ngày / bấm Esc huỷ kéo → không có `drop`, viền
    // vàng "ô nhận ghi chú" sẽ kẹt lại. `dragend` luôn bắn khi kết thúc kéo
    // dù thành công hay không, nên dọn ở đây cho chắc.
    '(document:dragend)': 'dragOverDayKey.set(null)',
    '(document:drop)': 'dragOverDayKey.set(null)',
  },
})
export class TimeGridView {
  protected readonly store = inject(CalendarStore);
  private readonly dialog = inject(DialogService);
  private readonly clock = inject(Clock);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly i18n = inject(TranslationService);
  protected readonly timeFormatService = inject(TimeFormatService);

  getLunarInfo(day: Date): LunarDate {
    return convertSolarToLunar(day);
  }

  /** Phần số của ngày âm cho tiêu đề cột — chữ "ÂL" hiện một lần ở máng giờ. */
  lunarLabel(day: Date): string {
    return lunarCellLabel(this.getLunarInfo(day));
  }

  /** Sự kiện "ngày lễ" tổng hợp để mở HolidayInfoModal khi bấm nhãn lễ — lễ
   *  đã không còn nằm trong hàng "Cả ngày" cùng sự kiện người dùng tạo. */
  holidayEventFor(day: Date): CalendarEvent | null {
    const holiday = this.holidayFor(day);
    if (!holiday) return null;
    const base = startOfDay(day);
    return {
      id: `${VN_HOLIDAY_CALENDAR_ID}::${holiday.id}::${day.getFullYear()}`,
      calendarId: VN_HOLIDAY_CALENDAR_ID,
      title: holidayName(holiday, this.i18n.locale()),
      start: base,
      end: base,
      allDay: true,
      calendarType: holidayCalendarType(holiday),
    };
  }

  openHoliday(day: Date, domEvent: MouseEvent): void {
    domEvent.stopPropagation();
    const event = this.holidayEventFor(day);
    if (event) this.editRequested.emit(event);
  }

  lunarTooltip(day: Date): string {
    const info = this.getLunarInfo(day);
    return this.i18n.t('calendar.lunarTooltip', { day: info.day, month: info.month });
  }

  holidayFor(day: Date): Holiday | null {
    // Tôn trọng công tắc "Ngày lễ ở Việt Nam" trong thanh bên.
    if (!this.store.visibleCalendarIds().has(VN_HOLIDAY_CALENDAR_ID)) return null;
    return resolveTopHolidayForDate(day);
  }

  holidayTooltip(day: Date): string {
    const holiday = this.holidayFor(day);
    return holiday
      ? this.i18n.t('holiday.badgeTooltip', { name: holidayName(holiday, this.i18n.locale()) })
      : '';
  }

  /** Nhãn hiển thị của ngày lễ, dịch theo ngôn ngữ hiện tại. */
  holidayLabel(holiday: Holiday): string {
    return holidayName(holiday, this.i18n.locale());
  }

  conflictTooltip(eventId: string): string {
    return this.store.conflictingEventIds().has(eventId) ? this.i18n.t('calendar.conflictTooltip') : '';
  }

  protected readonly colorHex = CALENDAR_COLOR_HEX;
  protected readonly noteColorHex = NOTE_COLOR_HEX;

  readonly days = input.required<Date[]>();
  readonly createRequested = output<CreateRequest>();
  readonly editRequested = output<CalendarEvent>();

  protected formatHourLabel(hour: number): string {
    return formatHourLabel(hour, this.i18n.locale(), this.timeFormatService.format());
  }

  protected formatTimeLabel(date: Date): string {
    return formatTimeLabel(date, this.i18n.locale(), this.timeFormatService.format());
  }

  protected weekdayShort(day: Date): string {
    return weekdayShort(day, this.i18n.locale());
  }

  protected readonly HOUR_HEIGHT = HOUR_HEIGHT;
  protected readonly DAY_HEIGHT = HOUR_HEIGHT * 24;
  protected readonly hours = Array.from({ length: 24 }, (_, i) => i);

  private readonly scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');
  // Điện thoại: mỗi cột ngày được ép một bề rộng tối thiểu (xem CSS) để 7 cột
  // không bị bóp còn vài chục pixel, nên .scroll-area cuộn NGANG lẫn dọc. Hai
  // hàng còn lại (tiêu đề + "Cả ngày") phải cuộn ngang THEO — không có thanh
  // cuộn riêng của chúng (CSS đặt overflow-x: hidden), scrollLeft của chúng bị
  // đẩy bằng tay ở đây mỗi khi .scroll-area cuộn.
  private readonly dayHeaderRow = viewChild<ElementRef<HTMLElement>>('dayHeaderRow');
  private readonly allDayRow = viewChild<ElementRef<HTMLElement>>('allDayRow');

  protected readonly scrollbarWidth = signal(6);

  protected readonly now = signal(this.clock.now());
  protected readonly nowTop = computed(() => (minutesSinceMidnight(this.now()) / 60) * HOUR_HEIGHT);

  protected readonly dragCreate = signal<DragCreateState | null>(null);
  protected readonly dragMove = signal<DragMoveState | null>(null);
  protected readonly dragResize = signal<DragResizeState | null>(null);

  /** Khối đang bị kéo/đổi độ dài — để template gắn class `.dragging`. */
  protected isDragging(eventId: string): boolean {
    return this.dragMove()?.eventId === eventId || this.dragResize()?.eventId === eventId;
  }

  /** `transform` cho khối đang được DI CHUYỂN — pixel thô, bám sát ngón tay. */
  protected moveTransform(eventId: string): string | null {
    const m = this.dragMove();
    return m && m.eventId === eventId
      ? `translate(${m.dxPx}px, ${m.dyPx}px) scale(1.02)`
      : null;
  }

  /** Bù `top` / `height` cho khối đang ĐỔI ĐỘ DÀI (kéo mép trên / dưới). */
  protected resizeTopOffset(eventId: string): number {
    const r = this.dragResize();
    return r && r.eventId === eventId && r.edge === 'top' ? r.dyPx : 0;
  }
  protected resizeHeightDelta(eventId: string): number {
    const r = this.dragResize();
    if (!r || r.eventId !== eventId) return 0;
    return r.edge === 'bottom' ? r.dyPx : -r.dyPx;
  }

  /** Giờ hiển thị trên khối — đổi theo vị trí kéo/độ dài đang chỉnh (đã snap). */
  protected liveTimeLabel(pe: PositionedEvent): string {
    const m = this.dragMove();
    const r = this.dragResize();
    let start = pe.event.start;
    if (m && m.eventId === pe.event.id) start = addMinutes(start, m.snapMin);
    else if (r && r.eventId === pe.event.id && r.edge === 'top')
      start = addMinutes(start, r.snapMin);
    return this.formatTimeLabel(start);
  }

  protected readonly Math = Math;

  protected readonly timedEventsByDay = computed(() => {
    const map = new Map<string, PositionedEvent[]>();

    // KHÔNG nhào nặn sự kiện đang kéo vào đây nữa: khối đang kéo được dời bằng
    // `transform: translate()` (xem moveTransform / resizeHeightDelta) nên bố
    // cục cả ngày đứng yên suốt lúc kéo ⇒ không re-layout mỗi frame ⇒ mượt.
    const events = this.store.visibleEvents();

    for (const day of this.days()) {
      const dayStart = startOfDay(day);
      const dayEnd = addDays(dayStart, 1);
      const dayEvents = events.filter(
        (e) =>
          e.calendarId !== VN_HOLIDAY_CALENDAR_ID &&
          !e.allDay &&
          e.start.getTime() < dayEnd.getTime() &&
          e.end.getTime() > dayStart.getTime(),
      );
      map.set(toDateInputValue(day), layoutDayEvents(dayEvents, HOUR_HEIGHT, day));
    }
    return map;
  });

  protected readonly allDayEventsByDay = computed(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of this.days()) {
      map.set(
        toDateInputValue(day),
        this.store
          .visibleEvents()
          .filter(
            (e) =>
              e.calendarId !== VN_HOLIDAY_CALENDAR_ID &&
              e.allDay &&
              isEventOnDay(e, day),
          ),
      );
    }
    return map;
  });

  constructor() {
    const intervalId = setInterval(() => this.now.set(this.clock.now()), 30_000);
    this.destroyRef.onDestroy(() => clearInterval(intervalId));

    afterNextRender(() => {
      this.scrollContainer()?.nativeElement.scrollTo({ top: 7 * HOUR_HEIGHT - 32 });
      this.measureScrollbarWidth();
    });

    const onResize = () => this.measureScrollbarWidth();
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => window.removeEventListener('resize', onResize));
  }

  private measureScrollbarWidth(): void {
    const el = this.scrollContainer()?.nativeElement;
    if (!el) return;
    this.scrollbarWidth.set(el.offsetWidth - el.clientWidth);
  }

  protected onGridScroll(event: Event): void {
    const scrollLeft = (event.target as HTMLElement).scrollLeft;
    const header = this.dayHeaderRow()?.nativeElement;
    const allDay = this.allDayRow()?.nativeElement;
    if (header) header.scrollLeft = scrollLeft;
    if (allDay) allDay.scrollLeft = scrollLeft;
  }

  isNextDay(dayKeyA: string, dayB: Date): boolean {
    const parts = dayKeyA.split('-').map(Number);
    if (parts.length !== 3) return false;
    const dayA = new Date(parts[0], parts[1] - 1, parts[2]);
    const nextDayA = addDays(dayA, 1);
    return isSameDay(nextDayA, dayB);
  }

  dayKey(day: Date): string {
    return toDateInputValue(day);
  }

  isToday(day: Date): boolean {
    return isSameDay(day, this.store.today());
  }

  eventsFor(day: Date): PositionedEvent[] {
    return this.timedEventsByDay().get(this.dayKey(day)) ?? [];
  }

  allDayEventsFor(day: Date): CalendarEvent[] {
    return this.allDayEventsByDay().get(this.dayKey(day)) ?? [];
  }

  /** Ghi chú do người dùng kéo-thả "dán" lên đúng ngày này — cùng cơ chế với
   *  month-view (xem `CalendarStore.pinNoteToDay()`). Đặt ở hàng "Cả ngày" vì
   *  ghi chú không có giờ, giống hệt lý do sự kiện cả ngày cũng nằm ở đó. */
  private readonly notesByDay = computed(() => {
    const map = new Map<string, Note[]>();
    for (const note of this.store.notes()) {
      if (!note.pinnedDate) continue;
      const key = this.dayKey(note.pinnedDate);
      const list = map.get(key) ?? [];
      list.push(note);
      map.set(key, list);
    }
    return map;
  });

  notesFor(day: Date): Note[] {
    return this.notesByDay().get(this.dayKey(day)) ?? [];
  }

  /** Áp dụng cho CẢ hàng "Cả ngày" LẪN toàn bộ cột giờ bên dưới — ghi chú
   *  không có khái niệm giờ nên thả vào bất kỳ đâu trong cột của một ngày
   *  đều "dán" lên đúng ngày đó, không cần nhắm chính xác vào dải mỏng phía
   *  trên (dễ bị bỏ lỡ, đặc biệt lần đầu dùng). */
  private isNoteDrag(event: DragEvent): boolean {
    return !!event.dataTransfer?.types.includes('application/x-note-id');
  }

  protected readonly dragOverDayKey = signal<string | null>(null);

  onNoteDropZoneDragEnter(event: DragEvent, day: Date): void {
    if (!this.isNoteDrag(event)) return;
    this.dragOverDayKey.set(this.dayKey(day));
  }

  onNoteDropZoneDragLeave(_event: DragEvent, day: Date): void {
    if (this.dragOverDayKey() === this.dayKey(day)) this.dragOverDayKey.set(null);
  }

  isDragOver(day: Date): boolean {
    return this.dragOverDayKey() === this.dayKey(day);
  }

  onNoteDropZoneDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onNoteDropZoneDrop(event: DragEvent, day: Date): void {
    event.preventDefault();
    // Thả trúng cột ngày → dán vào ngày; chặn nổi bọt để handler `document:drop`
    // của <app-screen-notes> không dán chồng lên màn hình.
    event.stopPropagation();
    this.dragOverDayKey.set(null);
    const noteId = event.dataTransfer?.getData('application/x-note-id');
    if (noteId) void this.store.pinNoteToDay(noteId, day);
  }

  /** GỠ ghi chú khỏi ngày — không hỏi, nội dung vẫn còn trong danh sách. */
  unpinNote(event: MouseEvent, noteId: string): void {
    event.stopPropagation();
    void this.store.unpinNote(noteId);
  }

  protected readonly deletingNoteId = signal<string | null>(null);

  /** XÓA hẳn ghi chú — hỏi xác nhận rồi chuyển vào Thùng rác ghi chú. */
  async deletePinnedNote(event: MouseEvent, noteId: string): Promise<void> {
    event.stopPropagation();
    if (this.deletingNoteId()) return;
    const ok = await this.dialog.confirm(this.i18n.t('note.deleteBody'), {
      title: this.i18n.t('sidebar.deleteNoteTitle'),
      confirmLabel: this.i18n.t('sidebar.deleteNoteConfirm'),
      danger: true,
    });
    if (!ok) return;
    this.deletingNoteId.set(noteId);
    try {
      await this.store.deleteNote(noteId);
    } catch {
      await this.dialog.alert(this.i18n.t('sidebar.deleteNoteError'));
    } finally {
      this.deletingNoteId.set(null);
    }
  }

  blockTop(pe: PositionedEvent): number {
    return pe.top;
  }

  blockHeight(pe: PositionedEvent): number {
    return pe.height;
  }

  colorFor(event: CalendarEvent): string {
    return this.colorHex[this.store.calendarColor().get(event.calendarId) ?? 'blue'];
  }

  onChipClick(event: CalendarEvent, domEvent: MouseEvent): void {
    domEvent.stopPropagation();
    this.editRequested.emit(event);
  }

  onAllDayCellClick(day: Date): void {
    // end is the inclusive last day here — save() in event-form-modal adds
    // the +1 day itself to get the exclusive storage end.
    this.createRequested.emit({
      start: startOfDay(day),
      end: startOfDay(day),
      allDay: true,
    });
  }

  onGridMouseDown(mouseEvent: MouseEvent, day: Date): void {
    if (mouseEvent.button !== 0) return;
    const columnEl = mouseEvent.currentTarget as HTMLElement;
    const rect = columnEl.getBoundingClientRect();
    const startMin = snap(((mouseEvent.clientY - rect.top) / HOUR_HEIGHT) * 60);
    const dayKey = this.dayKey(day);
    const container = this.scrollContainer()?.nativeElement;

    this.dragCreate.set({ dayKey, startMin, endMin: startMin + 30 });

    let moved = false;
    let animFrameId: number | null = null;
    let lastClientY = mouseEvent.clientY;

    const updateCreate = () => {
      animFrameId = null;
      if (container) {
        const cRect = container.getBoundingClientRect();
        if (lastClientY < cRect.top + 40) {
          container.scrollTop -= 12;
        } else if (lastClientY > cRect.bottom - 40) {
          container.scrollTop += 12;
        }
      }

      const currentMin = snap(((lastClientY - rect.top) / HOUR_HEIGHT) * 60);
      moved = true;
      const lo = Math.min(startMin, currentMin);
      const hi = Math.max(startMin, currentMin);
      this.dragCreate.set({ dayKey, startMin: lo, endMin: Math.max(hi, lo + SNAP_MINUTES) });
    };

    const onMove = (e: MouseEvent) => {
      lastClientY = e.clientY;
      if (!animFrameId) {
        animFrameId = requestAnimationFrame(updateCreate);
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (animFrameId) cancelAnimationFrame(animFrameId);
      const state = this.dragCreate();
      this.dragCreate.set(null);
      if (!state) return;
      const start = minutesToDate(day, state.startMin);
      const end = moved ? minutesToDate(day, state.endMin) : minutesToDate(day, startMin + 60);
      this.createRequested.emit({ start, end, allDay: false });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  /**
   * Kéo để DI CHUYỂN sự kiện — lên/xuống đổi GIỜ, trái/phải đổi NGÀY (cột).
   *
   * Chuột: vào chế độ kéo ngay khi nhấn.
   * Chạm: NHẤN GIỮ ~260ms mới "nhấc" sự kiện (rung nhẹ + phóng to) — giống
   * Google Calendar. Vì `.event-block` đặt `touch-action: none` trên di động,
   * trong lúc chờ nhấn-giữ mà ngón tay trượt thì component TỰ đẩy cuộn cho lưới
   * (scrollTop/scrollLeft), nên vuốt-để-cuộn vẫn mượt và không lỡ mở trình sửa.
   */
  onBlockPointerDown(ev: PointerEvent, pe: PositionedEvent): void {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    const el = ev.currentTarget as HTMLElement;
    const isTouch = ev.pointerType === 'touch';
    const container = this.scrollContainer()?.nativeElement;
    // Bắt con trỏ + nghe sự kiện trên VÙNG CUỘN (phần tử ổn định), KHÔNG trên
    // khối sự kiện: khi kéo đổi cột ngày, khối bị render lại ở cột khác —
    // capture/listener gắn trên khối cũ sẽ mất, đứng kéo giữa chừng.
    const capEl: HTMLElement = container ?? el;

    // startX/startY được ĐẶT LẠI ngay lúc "nhấc" (activate) — nếu giữ mốc từ
    // pointerdown thì phần ngón tay lỡ trôi trong 260ms chờ sẽ bị tính thành
    // một bước nhảy 15 phút ngay khi bắt đầu kéo ("giật 1 cái").
    let startX = ev.clientX;
    let startY = ev.clientY;
    let startScrollTop = container?.scrollTop ?? 0;
    let lastX = startX;
    let lastY = startY;
    let preLastX = startX;
    let preLastY = startY;
    let active = false;
    let moved = false;
    let slid = false;
    let animFrameId: number | null = null;
    let longPressTimer: number | null = null;
    // Đo TỌA ĐỘ CÁC CỘT một lần lúc nhấc, không đo lại mỗi frame (getBounding
    // ClientRect trong vòng lặp là thủ phạm giật kinh điển — buộc reflow).
    let colRects: DOMRect[] = [];
    let startDayIndex = 0;

    if (isTouch) {
      try {
        capEl.setPointerCapture(ev.pointerId);
      } catch {
        /* noop */
      }
    }

    const updateMove = (): void => {
      animFrameId = null;

      if (container) {
        const cRect = container.getBoundingClientRect();
        if (lastY < cRect.top + 40) container.scrollTop -= 12;
        else if (lastY > cRect.bottom - 40) container.scrollTop += 12;
      }

      // Cộng bù phần lưới đã tự cuộn từ lúc nhấc, để khối bám đúng ngón tay.
      const scrolled = (container?.scrollTop ?? 0) - startScrollTop;
      const dyPx = lastY - startY + scrolled;
      const dxPx = lastX - startX;
      if (Math.abs(dyPx) > 3 || Math.abs(dxPx) > 10) moved = true;

      const snapMin = snapSigned((dyPx / HOUR_HEIGHT) * 60);

      let snapDays = 0;
      for (let i = 0; i < colRects.length; i++) {
        if (lastX >= colRects[i].left && lastX <= colRects[i].right) {
          snapDays = i - startDayIndex;
          break;
        }
      }

      this.dragMove.set({ eventId: pe.event.id, dxPx, dyPx, snapMin, snapDays });
    };

    const activate = (): void => {
      active = true;
      longPressTimer = null;
      // Mốc 0 = đúng vị trí ngón tay lúc nhấc (bỏ phần trôi trong lúc chờ).
      startX = lastX;
      startY = lastY;
      startScrollTop = container?.scrollTop ?? 0;
      moved = false;
      if (container) {
        colRects = Array.from(container.querySelectorAll('.day-col')).map((c) =>
          c.getBoundingClientRect(),
        );
        const idx = this.days().findIndex((d) => isSameDay(d, pe.event.start));
        startDayIndex = idx === -1 ? 0 : idx;
      }
      if (isTouch) navigator.vibrate?.(8);
      try {
        capEl.setPointerCapture(ev.pointerId);
      } catch {
        /* trình duyệt cũ / phần tử đã bỏ */
      }
      this.dragMove.set({ eventId: pe.event.id, dxPx: 0, dyPx: 0, snapMin: 0, snapDays: 0 });
    };

    const cleanup = (commit: boolean): void => {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      capEl.removeEventListener('pointermove', onPointerMove);
      capEl.removeEventListener('pointerup', onPointerUp);
      capEl.removeEventListener('pointercancel', onPointerCancel);
      try {
        capEl.releasePointerCapture(ev.pointerId);
      } catch {
        /* noop */
      }
      if (animFrameId) cancelAnimationFrame(animFrameId);
      const state = this.dragMove();
      this.dragMove.set(null);

      if (!active) {
        // Chưa kịp "nhấc": chỉ mở trình sửa nếu là một cú CHẠM sạch (không cuộn,
        // gần đứng yên, nhả nhanh) — không phải khi trình duyệt huỷ để cuộn.
        const dist = Math.hypot(lastX - startX, lastY - startY);
        if (commit && !slid && dist < 12) this.editRequested.emit(pe.event);
        return;
      }
      if (!commit || !moved || !state) {
        this.editRequested.emit(pe.event);
        return;
      }

      let newStart = addMinutes(pe.event.start, state.snapMin);
      let newEnd = addMinutes(pe.event.end, state.snapMin);
      if (state.snapDays) {
        newStart = addDays(newStart, state.snapDays);
        newEnd = addDays(newEnd, state.snapDays);
      }
      this.store.updateEvent(pe.event.id, { start: newStart, end: newEnd });
    };

    const onPointerMove = (e: PointerEvent): void => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (!active) {
        const far = Math.hypot(e.clientX - startX, e.clientY - startY) > 12;
        if (far) {
          // Người dùng đang cuộn, không phải giữ để kéo. Huỷ nhấn-giữ và tự đẩy
          // cuộn cho lưới (touch-action:none đã chặn cuộn tự nhiên trên khối).
          slid = true;
          if (longPressTimer !== null) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
          if (container) {
            container.scrollTop -= e.clientY - preLastY;
            container.scrollLeft -= e.clientX - preLastX;
          }
        }
        preLastX = e.clientX;
        preLastY = e.clientY;
        return;
      }
      e.preventDefault();
      if (!animFrameId) animFrameId = requestAnimationFrame(updateMove);
    };

    const onPointerUp = (): void => cleanup(true);
    // Trình duyệt giành cử chỉ để cuộn → coi như đã cuộn, KHÔNG mở trình sửa.
    const onPointerCancel = (): void => {
      slid = true;
      cleanup(false);
    };

    capEl.addEventListener('pointermove', onPointerMove);
    capEl.addEventListener('pointerup', onPointerUp);
    capEl.addEventListener('pointercancel', onPointerCancel);

    if (isTouch) {
      longPressTimer = window.setTimeout(activate, 260);
    } else {
      ev.preventDefault();
      ev.stopPropagation();
      activate();
    }
  }

  /**
   * Kéo mép TRÊN hoặc DƯỚI để đổi độ dài sự kiện (`edge` = 'top' đổi giờ bắt
   * đầu, 'bottom' đổi giờ kết thúc). Kích hoạt ngay cả trên chạm (vùng tay cầm
   * có chủ đích), chỉ đổi giờ sau khi ngón tay nhích > 4px.
   */
  onResizePointerDown(
    ev: PointerEvent,
    pe: PositionedEvent,
    edge: 'top' | 'bottom' = 'bottom',
  ): void {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const el = ev.currentTarget as HTMLElement;
    const container = this.scrollContainer()?.nativeElement;
    // Xem chú thích ở onBlockPointerDown: bắt/nghe trên vùng cuộn ổn định vì
    // khối (và tay cầm resize con của nó) bị render lại khi đổi độ dài.
    const capEl: HTMLElement = container ?? el;
    const startY = ev.clientY;
    const startScrollTop = container?.scrollTop ?? 0;
    const originalDuration = diffMinutes(pe.event.start, pe.event.end);
    const origHeightPx = pe.height;

    let lastY = startY;
    let engaged = false;
    let animFrameId: number | null = null;

    this.dragResize.set({ eventId: pe.event.id, edge, dyPx: 0, snapMin: 0 });
    try {
      capEl.setPointerCapture(ev.pointerId);
    } catch {
      /* noop */
    }

    const updateResize = (): void => {
      animFrameId = null;
      if (container) {
        const cRect = container.getBoundingClientRect();
        if (lastY < cRect.top + 44) container.scrollTop -= 14;
        else if (lastY > cRect.bottom - 44) container.scrollTop += 14;
      }
      const scrolled = (container?.scrollTop ?? 0) - startScrollTop;
      let dyPx = lastY - startY + scrolled;
      // Chặn để khối không nhỏ hơn ~12px (giữ đọc được).
      if (edge === 'bottom') dyPx = Math.max(dyPx, 12 - origHeightPx);
      else dyPx = Math.min(dyPx, origHeightPx - 12);

      let snapMin = snapSigned((dyPx / HOUR_HEIGHT) * 60);
      if (edge === 'bottom') {
        if (originalDuration + snapMin < SNAP_MINUTES) snapMin = SNAP_MINUTES - originalDuration;
      } else if (originalDuration - snapMin < SNAP_MINUTES) {
        snapMin = originalDuration - SNAP_MINUTES;
      }
      this.dragResize.set({ eventId: pe.event.id, edge, dyPx, snapMin });
    };

    const onPointerMove = (e: PointerEvent): void => {
      lastY = e.clientY;
      if (!engaged && Math.abs(e.clientY - startY) <= 4) return;
      engaged = true;
      e.preventDefault();
      if (!animFrameId) animFrameId = requestAnimationFrame(updateResize);
    };

    const cleanup = (commit: boolean): void => {
      capEl.removeEventListener('pointermove', onPointerMove);
      capEl.removeEventListener('pointerup', onPointerUp);
      capEl.removeEventListener('pointercancel', onPointerCancel);
      try {
        capEl.releasePointerCapture(ev.pointerId);
      } catch {
        /* noop */
      }
      if (animFrameId) cancelAnimationFrame(animFrameId);
      const state = this.dragResize();
      this.dragResize.set(null);
      if (commit && state && state.snapMin !== 0) {
        if (edge === 'bottom') {
          this.store.updateEvent(pe.event.id, { end: addMinutes(pe.event.end, state.snapMin) });
        } else {
          this.store.updateEvent(pe.event.id, { start: addMinutes(pe.event.start, state.snapMin) });
        }
      }
    };

    const onPointerUp = (): void => cleanup(true);
    const onPointerCancel = (): void => cleanup(false);

    capEl.addEventListener('pointermove', onPointerMove);
    capEl.addEventListener('pointerup', onPointerUp);
    capEl.addEventListener('pointercancel', onPointerCancel);
  }
}

function snapSigned(min: number): number {
  return Math.round(min / SNAP_MINUTES) * SNAP_MINUTES;
}

function minutesToDate(day: Date, totalMinutes: number): Date {
  return clampToDay(
    new Date(2000, 0, 1, Math.floor(totalMinutes / 60), totalMinutes % 60),
    day,
  );
}
