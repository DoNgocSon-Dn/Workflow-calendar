import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { CalendarStore } from '../../data/calendar-store';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { CALENDAR_COLOR_HEX, CalendarEvent } from '../../models/calendar.models';
import { DatePipe } from '@angular/common';
import { convertSolarToLunar } from '../../utils/lunar-calendar';
import { resolveTopHolidayForDate } from '../../utils/holiday-resolver';
import { VN_HOLIDAY_CALENDAR_ID } from '../../data/vietnam-holidays';
import { Icon } from '../../../../shared/components/icon/icon';

export interface GroupedAgendaDay {
  date: Date;
  dateLabel: string;
  events: (CalendarEvent & { isLunarEvent?: boolean })[];
}

export type AgendaRangeFilter = 'month' | 'next30' | 'all';
export type CalendarType = 'solar' | 'lunar';

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
  protected readonly colorHex = CALENDAR_COLOR_HEX;

  readonly selectEvent = output<string>();

  protected readonly filterMode = signal<AgendaRangeFilter>('month');
  protected readonly calendarType = signal<CalendarType>('lunar');
  protected readonly maxDisplayedDays = signal<number>(10);

  setFilterMode(mode: AgendaRangeFilter): void {
    this.filterMode.set(mode);
    this.maxDisplayedDays.set(10);
  }

  setCalendarType(type: CalendarType): void {
    this.calendarType.set(type);
  }

  loadMore(): void {
    this.maxDisplayedDays.update((prev) => prev + 10);
  }

  holidayTagFor(date: Date): string | null {
    const holiday = resolveTopHolidayForDate(date);
    if (!holiday) return null;
    return holiday.name;
  }

  protected colorFor(event: CalendarEvent & { isLunarEvent?: boolean }): string {
    if (event.isLunarEvent) return 'var(--color-warning)';
    return this.colorHex[this.store.calendarColor().get(event.calendarId) ?? 'blue'];
  }

  protected readonly currentMonthLabel = computed(() => {
    const d = this.store.focusedDate();
    const locale = this.i18n.locale() === 'en' ? 'en-US' : 'vi-VN';
    return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  });

  protected readonly allGroupedDays = computed<GroupedAgendaDay[]>(() => {
    const allEvents = this.store.visibleEvents();
    const focused = this.store.focusedDate();
    const mode = this.filterMode();
    const calType = this.calendarType();
    const intlLocale = this.i18n.locale() === 'en' ? 'en-US' : 'vi-VN';

    let filtered = allEvents;

    if (mode === 'month') {
      const year = focused.getFullYear();
      const month = focused.getMonth();
      filtered = allEvents.filter((e) => {
        const d = new Date(e.start);
        return d.getFullYear() === year && d.getMonth() === month;
      });
    } else if (mode === 'next30') {
      const startMs = new Date(
        focused.getFullYear(),
        focused.getMonth(),
        focused.getDate(),
      ).getTime();
      const endMs = startMs + 30 * 24 * 60 * 60 * 1000;
      filtered = allEvents.filter((e) => {
        const time = new Date(e.start).getTime();
        return time >= startMs && time <= endMs;
      });
    }

    // Khi chọn Lịch Âm: Lọc bỏ các sự kiện Lễ Dương lịch để nhường chỗ cho ngày Lễ Âm Lịch
    if (calType === 'lunar') {
      filtered = filtered.filter((e) => e.calendarId !== VN_HOLIDAY_CALENDAR_ID);
    }

    const map = new Map<string, { date: Date; events: (CalendarEvent & { isLunarEvent?: boolean })[] }>();

    for (const e of filtered) {
      const startDate = new Date(e.start);
      const endDate = new Date(e.end);
      const year = startDate.getFullYear();
      const month = String(startDate.getMonth() + 1).padStart(2, '0');
      const day = String(startDate.getDate()).padStart(2, '0');
      const dayKey = `${year}-${month}-${day}`;

      if (!map.has(dayKey)) {
        map.set(dayKey, { date: startDate, events: [] });
      }
      map.get(dayKey)!.events.push({
        ...e,
        start: startDate,
        end: endDate,
      });
    }

    // Khi ở chế độ Lịch Âm: Tự động tính toán & chèn các Sự kiện Âm lịch (Tết Nguyên Đán, Rằm, Mùng 1, Giỗ Tổ...)
    if (calType === 'lunar') {
      const dateList: Date[] = [];
      const baseDate = new Date(focused.getFullYear(), focused.getMonth(), focused.getDate());

      if (mode === 'month') {
        const year = focused.getFullYear();
        const month = focused.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
          dateList.push(new Date(year, month, d));
        }
      } else if (mode === 'next30') {
        for (let i = 0; i < 30; i++) {
          const d = new Date(baseDate);
          d.setDate(d.getDate() + i);
          dateList.push(d);
        }
      } else {
        // Mode 'all': Gom các ngày có sự kiện + 60 ngày tiếp theo để Lịch Âm luôn có đầy đủ sự kiện
        const dateSet = new Set<string>();
        for (let i = 0; i < 60; i++) {
          const d = new Date(baseDate);
          d.setDate(d.getDate() + i);
          const k = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
          dateSet.add(k);
          dateList.push(d);
        }

        for (const e of allEvents) {
          const d = new Date(e.start);
          const k = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
          if (!dateSet.has(k)) {
            dateSet.add(k);
            dateList.push(d);
          }
        }
      }

      for (const d of dateList) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dayKey = `${year}-${month}-${day}`;

        const holiday = resolveTopHolidayForDate(d);
        const lunar = convertSolarToLunar(d);

        let eventTitle: string | null = null;
        if (holiday) {
          eventTitle = `${holiday.icon || '🌸'} ${holiday.name}`;
        } else if (lunar.day === 1) {
          eventTitle = `🏮 Mùng 1 Tháng ${lunar.month} Âm Lịch`;
        } else if (lunar.day === 15) {
          eventTitle = `🌕 Ngày Rằm Tháng ${lunar.month} Âm Lịch`;
        }

        if (eventTitle) {
          if (!map.has(dayKey)) {
            map.set(dayKey, { date: d, events: [] });
          }
          const group = map.get(dayKey)!;
          const exists = group.events.some((ev) => ev.title === eventTitle);
          if (!exists) {
            group.events.unshift({
              id: `lunar-evt-${dayKey}-${eventTitle}`,
              calendarId: 'lunar-sys',
              title: eventTitle,
              start: d,
              end: d,
              allDay: true,
              isLunarEvent: true,
            });
          }
        }
      }
    }

    const keys = Array.from(map.keys()).sort();
    return keys
      .map((key) => {
        const item = map.get(key)!;
        let dateLabel = '';

        if (calType === 'lunar') {
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

        return {
          date: item.date,
          dateLabel,
          events: item.events,
        };
      })
      .filter((group) => group.events.length > 0);
  });

  protected readonly visibleGroupedDays = computed<GroupedAgendaDay[]>(() => {
    return this.allGroupedDays().slice(0, this.maxDisplayedDays());
  });

  protected readonly hasMore = computed<boolean>(() => {
    return this.allGroupedDays().length > this.maxDisplayedDays();
  });
}
