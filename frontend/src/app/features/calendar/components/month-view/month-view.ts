import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { DensityService } from '../../../../core/density/density-service';
import { DialogService } from '../../../../core/services/dialog.service';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { TimeFormatService } from '../../../../core/time-format/time-format-service';
import { CalendarStore } from '../../data/calendar-store';
import { CALENDAR_COLOR_HEX, CalendarEvent, NOTE_COLOR_HEX, Note } from '../../models/calendar.models';
import {
  addMinutes,
  buildMonthGrid,
  formatTimeLabel,
  isSameDay,
  isSameMonth,
  startOfDay,
  toDateInputValue,
} from '../../utils/date-utils';
import { isEventOnDay } from '../../utils/event-utils';

import { convertSolarToLunar, LunarDate, lunarCellLabel } from '../../utils/lunar-calendar';
import {
  resolveTopHolidayForDate,
  holidayCalendarType,
  holidayName,
} from '../../utils/holiday-resolver';
import { Holiday } from '../../../../models/holiday-theme.model';
import { VN_HOLIDAY_CALENDAR_ID } from '../../data/vietnam-holidays';

interface DragSelectRange {
  start: Date;
  end: Date;
}

export interface CreateRequest {
  start: Date;
  end: Date;
  allDay: boolean;
}

@Component({
  selector: 'app-month-view',
  templateUrl: './month-view.html',
  styleUrl: './month-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // Kéo một ghi chú rồi thả RA NGOÀI ô ngày (hoặc bấm Esc huỷ) không sinh ra
    // sự kiện `drop` nào — nếu chỉ dựa vào `dragleave` thì viền vàng "ô nhận
    // ghi chú" kẹt lại vĩnh viễn. `dragend` luôn bắn trên nguồn kéo dù kết
    // thúc kiểu gì, nên đây là chỗ dọn chắc chắn.
    '(document:dragend)': 'dragOverDayKey.set(null)',
    '(document:drop)': 'dragOverDayKey.set(null)',
  },
})
export class MonthView {
  protected readonly store = inject(CalendarStore);
  private readonly densityService = inject(DensityService);
  private readonly dialog = inject(DialogService);
  protected readonly i18n = inject(TranslationService);
  private readonly timeFormatService = inject(TimeFormatService);
  protected readonly colorHex = CALENDAR_COLOR_HEX;
  protected readonly noteColorHex = NOTE_COLOR_HEX;

  protected readonly weekdayHeaders = computed(() => [
    this.i18n.t('weekday.mon'),
    this.i18n.t('weekday.tue'),
    this.i18n.t('weekday.wed'),
    this.i18n.t('weekday.thu'),
    this.i18n.t('weekday.fri'),
    this.i18n.t('weekday.sat'),
    this.i18n.t('weekday.sun'),
  ]);

  getLunarInfo(day: Date): LunarDate {
    return convertSolarToLunar(day);
  }

  /** Phần số của ngày âm cho góc ô — chữ "ÂL" và màu do template/CSS lo. */
  lunarLabel(day: Date): string {
    return lunarCellLabel(this.getLunarInfo(day));
  }

  /**
   * Sự kiện "ngày lễ" tổng hợp cho một ngày, dựng từ dữ liệu lễ tĩnh (không
   * phụ thuộc cửa sổ năm của lịch tham khảo, nên bấm được ở cả năm xa). Dùng
   * để mở HolidayInfoModal khi người dùng bấm nhãn lễ — vì lễ đã KHÔNG còn
   * nằm trong danh sách chip nữa.
   */
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
    // Tôn trọng công tắc "Ngày lễ ở Việt Nam" trong thanh bên: tắt lịch lễ thì
    // ẩn luôn nhãn lễ + nền theo lễ, đúng như tắt bất kỳ lịch nào khác.
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

  // Chế độ "Gọn" (Cài đặt > Hình thức) hiện nhiều sự kiện hơn mỗi ngày vì
  // mỗi dòng chiếm ít chỗ hơn — xem density-service.ts.
  private readonly maxVisiblePerDay = computed(() =>
    this.densityService.density() === 'compact' ? 5 : 3,
  );

  readonly createRequested = output<CreateRequest>();
  readonly editRequested = output<CalendarEvent>();

  readonly days = computed(() => buildMonthGrid(this.store.focusedDate()));
  readonly expandedDayKey = signal<string | null>(null);
  private draggingEventId: string | null = null;

  private isSelecting = false;
  private selectAnchor: Date | null = null;
  readonly dragSelectRange = signal<DragSelectRange | null>(null);

  private readonly eventsByDay = computed(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of this.days()) {
      const key = toDateInputValue(day);
      // Ngày lễ VN KHÔNG vào danh sách chip nữa — chúng hiển thị riêng thành
      // nhãn lễ dưới số ngày (xem template). Chip chỉ còn sự kiện người dùng tạo.
      const list = this.store
        .visibleEvents()
        .filter((e) => e.calendarId !== VN_HOLIDAY_CALENDAR_ID && isEventOnDay(e, day));
      list.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return a.start.getTime() - b.start.getTime();
      });
      map.set(key, list);
    }
    return map;
  });

  eventsFor(day: Date): CalendarEvent[] {
    return this.eventsByDay().get(toDateInputValue(day)) ?? [];
  }

  /** Ghi chú do người dùng kéo-thả "dán" lên đúng ngày này — xem
   *  `CalendarStore.pinNoteToDay()`. Không phải sự kiện thật. */
  private readonly notesByDay = computed(() => {
    const map = new Map<string, Note[]>();
    for (const note of this.store.notes()) {
      if (!note.pinnedDate) continue;
      const key = toDateInputValue(note.pinnedDate);
      const list = map.get(key) ?? [];
      list.push(note);
      map.set(key, list);
    }
    return map;
  });

  notesFor(day: Date): Note[] {
    return this.notesByDay().get(toDateInputValue(day)) ?? [];
  }

  /** Tối đa số mẩu giấy vẽ chồng lên một ngày trước khi gộp phần còn lại vào
   *  thẻ "+N" — chồng quá nhiều thì đống giấy trào ra che mất ngày bên cạnh. */
  private readonly maxNotesPerDay = 3;

  /** Ngày đang được người dùng bấm "+N" để xem hết cả xấp giấy. */
  readonly showAllNotesDayKey = signal<string | null>(null);

  notesToRenderFor(day: Date): Note[] {
    const all = this.notesFor(day);
    if (this.showAllNotesDayKey() === this.dayKey(day)) return all;
    return all.slice(0, this.maxNotesPerDay);
  }

  hiddenNotesCountFor(day: Date): number {
    if (this.showAllNotesDayKey() === this.dayKey(day)) return 0;
    return Math.max(0, this.notesFor(day).length - this.maxNotesPerDay);
  }

  revealAllNotes(day: Date, domEvent: MouseEvent): void {
    domEvent.stopPropagation();
    this.showAllNotesDayKey.set(this.dayKey(day));
  }

  /**
   * Kiểu "dán thủ công" cho một mẩu giấy — góc nghiêng và độ xê dịch nhỏ,
   * suy ra TỪ id nên mỗi tờ luôn nằm y một chỗ qua các lần vẽ lại (không nhảy
   * loạn mỗi lần Angular chạy change detection), nhưng giữa các tờ thì lệch
   * nhau đủ để trông như được dán vội bằng tay.
   */
  private readonly noteStyleCache = new Map<string, Record<string, string>>();

  noteStyle(note: Note): Record<string, string> {
    const cached = this.noteStyleCache.get(note.id);
    if (cached) return cached;

    let h = 5381;
    for (let i = 0; i < note.id.length; i++) h = ((h << 5) + h + note.id.charCodeAt(i)) >>> 0;

    const tilt = ((h % 640) / 100 - 3.2).toFixed(2); // -3.2deg .. 3.2deg
    const nudgeX = (((h >>> 8) % 180) / 10 - 9).toFixed(1); // -9px .. 9px
    const nudgeY = (((h >>> 16) % 130) / 10 - 5).toFixed(1); // -5px .. 8px

    const style: Record<string, string> = {
      '--tilt': `${tilt}deg`,
      '--nudge-x': `${nudgeX}px`,
      '--nudge-y': `${nudgeY}px`,
    };
    this.noteStyleCache.set(note.id, style);
    return style;
  }

  private readonly notePalette = Object.keys(NOTE_COLOR_HEX);
  protected readonly addingNoteForDay = signal<string | null>(null);

  /**
   * Thêm nhanh một mẩu giấy cho đúng ngày này. Ô ngày vốn đã bắt sự kiện
   * chuột để tạo SỰ KIỆN (kéo-chọn khoảng ngày), nên nút này là đường riêng —
   * bấm vào là hỏi nội dung rồi tạo ghi chú + ghim thẳng vào ngày, không đụng
   * tới luồng tạo sự kiện.
   */
  async onAddNoteClick(day: Date, domEvent: MouseEvent): Promise<void> {
    domEvent.stopPropagation();
    if (this.addingNoteForDay()) return;

    const content = (await this.dialog.prompt(this.i18n.t('sidebar.createNotePrompt')))?.trim();
    if (!content) return;

    this.addingNoteForDay.set(this.dayKey(day));
    try {
      const color =
        this.notePalette[Math.floor(Math.random() * this.notePalette.length)] ?? 'yellow';
      const note = await this.store.createNote(content, color);
      await this.store.pinNoteToDay(note.id, day);
    } catch {
      await this.dialog.alert(this.i18n.t('sidebar.createNoteError'));
    } finally {
      this.addingNoteForDay.set(null);
    }
  }

  visibleEventsFor(day: Date): CalendarEvent[] {
    return this.eventsFor(day).slice(0, this.maxVisiblePerDay());
  }

  hiddenCountFor(day: Date): number {
    return Math.max(0, this.eventsFor(day).length - this.maxVisiblePerDay());
  }

  eventLabel(event: CalendarEvent): string {
    return event.allDay
      ? event.title
      : `${formatTimeLabel(event.start, this.i18n.locale(), this.timeFormatService.format())} ${event.title}`;
  }

  isToday(day: Date): boolean {
    return isSameDay(day, this.store.today());
  }

  isCurrentMonth(day: Date): boolean {
    return isSameMonth(day, this.store.focusedDate());
  }

  dayKey(day: Date): string {
    return toDateInputValue(day);
  }

  isExpanded(day: Date): boolean {
    return this.expandedDayKey() === this.dayKey(day);
  }

  toggleExpanded(day: Date, event: MouseEvent): void {
    event.stopPropagation();
    const key = this.dayKey(day);
    this.expandedDayKey.set(this.expandedDayKey() === key ? null : key);
  }

  closeExpanded(): void {
    this.expandedDayKey.set(null);
  }

  isInDragRange(day: Date): boolean {
    const range = this.dragSelectRange();
    if (!range) return false;
    return day.getTime() >= range.start.getTime() && day.getTime() <= range.end.getTime();
  }

  onCellMouseDown(day: Date, mouseEvent: MouseEvent): void {
    if (mouseEvent.button !== 0) return;
    mouseEvent.preventDefault();
    this.closeExpanded();
    this.isSelecting = true;
    this.selectAnchor = day;
    this.dragSelectRange.set({ start: day, end: day });

    const onUp = () => {
      document.removeEventListener('mouseup', onUp);
      this.isSelecting = false;
      this.selectAnchor = null;
      const range = this.dragSelectRange();
      this.dragSelectRange.set(null);
      if (!range) return;

      if (isSameDay(range.start, range.end)) {
        const start = new Date(range.start);
        start.setHours(9, 0, 0, 0);
        this.createRequested.emit({ start, end: addMinutes(start, 60), allDay: false });
      } else {
        // end stays the inclusive last day here — the form shows/edits dates
        // inclusively and save() is the one place that adds the +1 day to
        // get the exclusive storage end (see event-form-modal.ts).
        this.createRequested.emit({
          start: range.start,
          end: range.end,
          allDay: true,
        });
      }
    };
    document.addEventListener('mouseup', onUp);
  }

  onCellMouseEnter(day: Date): void {
    if (!this.isSelecting || !this.selectAnchor) return;
    const anchor = this.selectAnchor;
    const [start, end] = anchor.getTime() <= day.getTime() ? [anchor, day] : [day, anchor];
    this.dragSelectRange.set({ start: startOfDay(start), end: startOfDay(end) });
  }

  onChipClick(event: CalendarEvent, domEvent: MouseEvent): void {
    domEvent.stopPropagation();
    this.editRequested.emit(event);
  }

  onDragStart(event: DragEvent, calEvent: CalendarEvent): void {
    this.draggingEventId = calEvent.id;
    event.dataTransfer?.setData('text/plain', calEvent.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  /** Ô ngày nào đang được kéo MỘT GHI CHÚ (không phải sự kiện) rê ngang qua —
   *  dùng để tô viền, cho người dùng THẤY rõ ràng chỗ nào nhận được, thay vì
   *  phải đoán. `dataTransfer.types` đọc được ngay từ dragenter (chỉ riêng
   *  `getData()` mới bị khoá tới lúc drop), nên không cần chờ thả mới biết
   *  đây có phải một ghi chú hay không. */
  protected readonly dragOverDayKey = signal<string | null>(null);

  private isNoteDrag(event: DragEvent): boolean {
    return !!event.dataTransfer?.types.includes('application/x-note-id');
  }

  onDayCellDragEnter(event: DragEvent, day: Date): void {
    if (!this.isNoteDrag(event)) return;
    this.dragOverDayKey.set(toDateInputValue(day));
  }

  onDayCellDragLeave(event: DragEvent, day: Date): void {
    if (this.dragOverDayKey() === toDateInputValue(day)) this.dragOverDayKey.set(null);
  }

  isDragOver(day: Date): boolean {
    return this.dragOverDayKey() === toDateInputValue(day);
  }

  onDrop(event: DragEvent, day: Date): void {
    event.preventDefault();
    // Thả TRÚNG một ô ngày → dán vào ngày, KHÔNG để nổi trên màn hình. Chặn nổi
    // bọt để handler `document:drop` của <app-screen-notes> không dán chồng.
    event.stopPropagation();
    this.dragOverDayKey.set(null);

    // Ghi chú kéo từ sidebar mang một kiểu dữ liệu RIÊNG (application/x-note-id)
    // — phải kiểm tra trước "text/plain" của sự kiện, nếu không sẽ không bao
    // giờ tới được nhánh này (event luôn có text/plain).
    const noteId = event.dataTransfer?.getData('application/x-note-id');
    if (noteId) {
      void this.store.pinNoteToDay(noteId, day);
      return;
    }

    const id = this.draggingEventId ?? event.dataTransfer?.getData('text/plain');
    if (id) this.store.moveEventToDay(id, day);
    this.draggingEventId = null;
  }

  /** GỠ tờ giấy khỏi ngày này — không hỏi gì, nội dung vẫn còn nguyên trong
   *  danh sách ghi chú ở sidebar, chỉ mất liên kết ngày. */
  unpinNote(event: MouseEvent, noteId: string): void {
    event.stopPropagation();
    void this.store.unpinNote(noteId);
  }

  protected readonly deletingNoteId = signal<string | null>(null);

  /** XÓA hẳn ghi chú — hỏi xác nhận trước, rồi chuyển vào Thùng rác ghi chú
   *  (khôi phục được). Khác hẳn "gỡ": xóa thì mất khỏi cả sidebar lẫn lịch. */
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
}
