import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { CalendarStore, localizedCalendarName } from '../../data/calendar-store';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { AuthStore } from '../../../../core/auth/auth-store';
import { Icon } from '../../../../shared/components/icon/icon';
import { CALENDAR_COLOR_HEX, CalendarEvent, CalendarType } from '../../models/calendar.models';
import { convertSolarToLunar } from '../../utils/lunar-calendar';
import { resolveHolidaysForDate, holidayCalendarType } from '../../utils/holiday-resolver';
import {
  AgendaScope,
  LUNAR_SYSTEM_CALENDAR_ID,
  eventSource,
  matchesAgendaScope,
} from '../../utils/event-classification';
import { VN_HOLIDAY_CALENDAR_ID } from '../../data/vietnam-holidays';
import { isSameDay, startOfDay, toDateInputValue } from '../../utils/date-utils';
import { deviceTimeZone, formatTzOffset, sameOffset, utcToZonedWall } from '../../utils/tz-utils';

type AgendaEvent = CalendarEvent & { isLunarMarker?: boolean };

export interface GroupedAgendaDay {
  date: Date;
  dateLabel: string;
  events: AgendaEvent[];
}

export type AgendaRangeFilter = 'month' | 'next30' | 'all';
export type MineTimeFilter = 'today' | '7d' | '30d' | 'month' | 'all';
export type MineStatusFilter = 'all' | 'upcoming' | 'past';
export type MineTypeFilter = 'all' | CalendarType;

const DAY_MS = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-agenda-view',
  templateUrl: './agenda-view.html',
  styleUrl: './agenda-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Icon],
})
export class AgendaView {
  protected readonly store = inject(CalendarStore);
  protected readonly i18n = inject(TranslationService);
  private readonly authStore = inject(AuthStore);
  protected readonly colorHex = CALENDAR_COLOR_HEX;

  readonly selectEvent = output<string>();

  /** ☀️ Lịch Dương · 🌙 Lịch Âm · ⭐ Sự kiện của tôi. */
  protected readonly scope = signal<AgendaScope>('solar');

  /** Bộ lọc khoảng thời gian cho scope 'solar' / 'lunar'. */
  protected readonly filterMode = signal<AgendaRangeFilter>('month');

  /** Bộ lọc riêng cho "Sự kiện của tôi". */
  protected readonly mineType = signal<MineTypeFilter>('all');
  protected readonly mineTime = signal<MineTimeFilter>('month');
  protected readonly mineStatus = signal<MineStatusFilter>('all');

  protected readonly maxDisplayedDays = signal<number>(10);

  private readonly viewerTz = deviceTimeZone();

  /** Sự kiện gắn múi giờ khác người xem: nhãn giờ gốc + offset (vd "09:00 GMT-4").
   *  Trả null nếu cùng offset, là sự kiện cả ngày, hoặc không gắn múi giờ. */
  protected tzBadge(event: CalendarEvent): string | null {
    if (!event.startTz || event.allDay) return null;
    if (sameOffset(event.startTz, this.viewerTz, event.start)) return null;
    const w = utcToZonedWall(event.start, event.startTz);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(w.hour)}:${pad(w.minute)} ${formatTzOffset(event.startTz, event.start)}`;
  }

  setScope(scope: AgendaScope): void {
    this.scope.set(scope);
    this.maxDisplayedDays.set(10);
  }

  setFilterMode(mode: AgendaRangeFilter): void {
    this.filterMode.set(mode);
    this.maxDisplayedDays.set(10);
  }

  setMineType(v: MineTypeFilter): void {
    this.mineType.set(v);
    this.maxDisplayedDays.set(10);
  }
  setMineTime(v: MineTimeFilter): void {
    this.mineTime.set(v);
    this.maxDisplayedDays.set(10);
  }
  setMineStatus(v: MineStatusFilter): void {
    this.mineStatus.set(v);
    this.maxDisplayedDays.set(10);
  }

  loadMore(): void {
    this.maxDisplayedDays.update((prev) => prev + 10);
  }

  protected colorFor(event: AgendaEvent): string {
    if (event.isLunarMarker) return 'var(--color-warning)';
    if (event.calendarId === VN_HOLIDAY_CALENDAR_ID) {
      return event.calendarType === 'lunar' ? 'var(--color-warning)' : 'var(--holiday-accent)';
    }
    return this.colorHex[this.store.calendarColor().get(event.calendarId) ?? 'blue'];
  }

  protected isSystemEvent(event: AgendaEvent): boolean {
    return !!event.isLunarMarker || eventSource(event) === 'system';
  }

  protected calendarTypeLabel(event: AgendaEvent): string {
    return (event.calendarType ?? 'solar') === 'lunar'
      ? this.i18n.t('agenda.calendarTypeLunar')
      : this.i18n.t('agenda.calendarTypeSolar');
  }

  /** Dòng phụ dưới tiêu đề event: "Dương lịch • <lịch>" hoặc "Âm lịch • Sự kiện hệ thống". */
  protected eventMeta(event: AgendaEvent): string {
    const type = this.calendarTypeLabel(event);
    if (this.isSystemEvent(event)) return `${type} • ${this.i18n.t('agenda.sourceSystem')}`;
    const rawCal =
      this.store.calendars().find((c) => c.id === event.calendarId)?.name ??
      this.store.otherCalendars().find((c) => c.id === event.calendarId)?.name;
    const cal = rawCal
      ? localizedCalendarName(rawCal, (k) => this.i18n.t(k))
      : this.i18n.t('agenda.sourceUser');
    return `${type} • ${cal}`;
  }

  /** Nhãn khoảng cho event kéo dài nhiều ngày (Tết Mùng 1 → Mùng 5). */
  protected multiDaySpan(event: AgendaEvent): string | null {
    const spanDays = Math.round((event.end.getTime() - event.start.getTime()) / DAY_MS);
    if (spanDays <= 1) return null;
    const last = new Date(event.end.getTime() - DAY_MS);
    if (this.scope() === 'lunar') {
      const a = convertSolarToLunar(event.start);
      const b = convertSolarToLunar(last);
      return this.i18n.t('agenda.dateSpan', {
        start: `${a.day}/${a.month}`,
        end: `${b.day}/${b.month} ÂL`,
      });
    }
    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return this.i18n.t('agenda.dateSpan', { start: fmt(event.start), end: fmt(last) });
  }

  protected readonly currentMonthLabel = computed(() => {
    const d = this.store.focusedDate();
    const locale = this.i18n.locale() === 'en' ? 'en-US' : 'vi-VN';
    return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  });

  protected readonly allGroupedDays = computed<GroupedAgendaDay[]>(() => {
    const scope = this.scope();
    const focused = this.store.focusedDate();
    const today = this.store.today();
    const intlLocale = this.i18n.locale() === 'en' ? 'en-US' : 'vi-VN';

    // 1. Lọc theo phạm vi (Dương / Âm / Của tôi)
    let list = this.store.visibleEvents().filter((e) => matchesAgendaScope(e, scope));

    // 2. Lọc thời gian (Áp dụng bộ lọc thời gian ở thanh công cụ cho cả 3 chế độ)
    list = this.applyRangeFilter(list, this.filterMode(), focused, today);

    // 3. Nếu là 'mine', lọc bổ sung theo Loại lịch & Trạng thái
    if (scope === 'mine') {
      list = this.applyMineSubFilters(list, today);
    }

    // 3. Gom theo ngày Dương của MỐC BẮT ĐẦU — event nhiều ngày chỉ một dòng.
    const map = new Map<string, { date: Date; events: AgendaEvent[] }>();
    for (const e of list) {
      const key = toDateInputValue(e.start);
      if (!map.has(key)) map.set(key, { date: startOfDay(e.start), events: [] });
      map.get(key)!.events.push({ ...e });
    }

    // 4. Scope Âm: chèn mốc Mùng 1 / Rằm hàng tháng (KHÔNG dựng lại ngày lễ —
    //    lễ âm đã là event thật ở bước 1). Bỏ qua nếu ngày đó đã có lễ âm.
    if (scope === 'lunar') {
      this.injectLunarMarkers(map, focused, this.filterMode(), today);
    }

    // 5. Nhãn ngày + sắp xếp
    return Array.from(map.keys())
      .sort()
      .map((key) => {
        const item = map.get(key)!;
        item.events.sort((a, b) => {
          if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
          return a.start.getTime() - b.start.getTime();
        });
        let dateLabel: string;
        if (scope === 'lunar') {
          const lunar = convertSolarToLunar(item.date);
          const weekday = item.date.toLocaleDateString(intlLocale, { weekday: 'long' });
          dateLabel = this.i18n.t('agenda.lunarDateLabel', {
            weekday,
            day: lunar.day,
            month: lunar.month,
            year: lunar.year,
            leap: lunar.isLeap ? this.i18n.t('agenda.leapYear') : '',
          });
        } else {
          dateLabel = item.date.toLocaleDateString(intlLocale, {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          });
        }
        return { date: item.date, dateLabel, events: item.events };
      })
      .filter((g) => g.events.length > 0);
  });

  private applyRangeFilter(
    list: CalendarEvent[],
    mode: AgendaRangeFilter,
    focused: Date,
    today: Date,
  ): CalendarEvent[] {
    if (mode === 'all') return list;
    if (mode === 'month') {
      return list.filter(
        (e) =>
          e.start.getFullYear() === focused.getFullYear() &&
          e.start.getMonth() === focused.getMonth(),
      );
    }
    const startMs = startOfDay(today).getTime();
    const endMs = startMs + 30 * DAY_MS;
    return list.filter((e) => {
      const t = e.start.getTime();
      return t >= startMs && t <= endMs;
    });
  }

  private applyMineSubFilters(list: CalendarEvent[], today: Date): CalendarEvent[] {
    const mineType = this.mineType();
    const mineStatus = this.mineStatus();
    const todayMs = startOfDay(today).getTime();
    const myId = this.authStore.user()?.id;

    return list.filter((e) => {
      if (myId && e.createdBy && e.createdBy !== myId) return false;
      if (mineType !== 'all' && (e.calendarType ?? 'solar') !== mineType) return false;
      if (mineStatus === 'upcoming' && e.end.getTime() < todayMs) return false;
      if (mineStatus === 'past' && e.end.getTime() >= todayMs) return false;
      return true;
    });
  }

  private injectLunarMarkers(
    map: Map<string, { date: Date; events: AgendaEvent[] }>,
    focused: Date,
    mode: AgendaRangeFilter,
    today: Date,
  ): void {
    const dates: Date[] = [];
    if (mode === 'month') {
      const y = focused.getFullYear();
      const m = focused.getMonth();
      const n = new Date(y, m + 1, 0).getDate();
      for (let d = 1; d <= n; d++) dates.push(new Date(y, m, d));
    } else {
      const base = startOfDay(today);
      const span = mode === 'next30' ? 30 : 365;
      for (let i = 0; i < span; i++) dates.push(new Date(base.getTime() + i * DAY_MS));
    }

    for (const d of dates) {
      const lunar = convertSolarToLunar(d);
      if (lunar.day !== 1 && lunar.day !== 15) continue;
      // Đã có lễ âm thật hôm nay (vd Rằm tháng 8 = Trung Thu) thì không thêm mốc chung.
      if (resolveHolidaysForDate(d).some((h) => holidayCalendarType(h) === 'lunar')) continue;

      const key = toDateInputValue(d);
      const title =
        lunar.day === 1
          ? this.i18n.t('agenda.lunarFirstDay', { month: lunar.month })
          : this.i18n.t('agenda.lunarFullMoon', { month: lunar.month });
      if (!map.has(key)) map.set(key, { date: startOfDay(d), events: [] });
      const group = map.get(key)!;
      if (group.events.some((e) => e.title === title)) continue;
      group.events.unshift({
        id: `lunar-marker-${key}`,
        calendarId: LUNAR_SYSTEM_CALENDAR_ID,
        title,
        start: startOfDay(d),
        end: startOfDay(d),
        allDay: true,
        calendarType: 'lunar',
        isLunarMarker: true,
      });
    }
  }

  protected readonly visibleGroupedDays = computed<GroupedAgendaDay[]>(() =>
    this.allGroupedDays().slice(0, this.maxDisplayedDays()),
  );

  protected readonly hasMore = computed<boolean>(
    () => this.allGroupedDays().length > this.maxDisplayedDays(),
  );

  protected onCardClick(event: AgendaEvent): void {
    if (event.isLunarMarker) return; // mốc lịch, không có chi tiết
    this.selectEvent.emit(event.id);
  }
}
