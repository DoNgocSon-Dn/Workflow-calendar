import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { CalendarStore } from '../../data/calendar-store';
import { CALENDAR_COLOR_HEX, CalendarEvent } from '../../models/calendar.models';
import { DatePipe } from '@angular/common';
import { convertSolarToLunar } from '../../utils/lunar-calendar';
import { VN_HOLIDAY_CALENDAR_ID } from '../../data/vietnam-holidays';

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
  imports: [DatePipe],
})
export class AgendaView {
  protected readonly store = inject(CalendarStore);
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

  protected colorFor(event: CalendarEvent & { isLunarEvent?: boolean }): string {
    if (event.isLunarEvent) return '#f59e0b';
    return this.colorHex[this.store.calendarColor().get(event.calendarId) ?? 'blue'];
  }

  protected readonly currentMonthLabel = computed(() => {
    const d = this.store.focusedDate();
    return d.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
  });

  protected readonly allGroupedDays = computed<GroupedAgendaDay[]>(() => {
    const allEvents = this.store.visibleEvents();
    const focused = this.store.focusedDate();
    const mode = this.filterMode();
    const calType = this.calendarType();

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

    // Khi chọn Lịch Âm: Lọc bỏ hoàn toàn các sự kiện Lễ Dương lịch cố định (Tết Dương lịch, 30/4, 1/5...)
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

    // Khi ở chế độ Lịch Âm: Tự động tính toán & chèn các Sự kiện Âm lịch chuẩn xác (Tết Nguyên Đán, Rằm, Mùng 1, Giỗ Tổ...)
    if (calType === 'lunar') {
      const dateList: Date[] = [];
      if (mode === 'month') {
        const year = focused.getFullYear();
        const month = focused.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
          dateList.push(new Date(year, month, d));
        }
      } else {
        map.forEach((val) => dateList.push(val.date));
      }

      for (const d of dateList) {
        const lunar = convertSolarToLunar(d);
        if (lunar.holidayTitle) {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const dayKey = `${year}-${month}-${day}`;

          if (!map.has(dayKey)) {
            map.set(dayKey, { date: d, events: [] });
          }
          const group = map.get(dayKey)!;
          const exists = group.events.some((ev) => ev.title === lunar.holidayTitle);
          if (!exists) {
            group.events.unshift({
              id: `lunar-evt-${dayKey}`,
              calendarId: 'lunar-sys',
              title: lunar.holidayTitle,
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
          const weekday = item.date.toLocaleDateString('vi-VN', { weekday: 'long' });
          dateLabel = `${weekday}, Ngày ${lunar.day} Tháng ${lunar.month} Âm lịch (Năm ${lunar.year}${lunar.isLeap ? ' Nhuận' : ''})`;
        } else {
          dateLabel = item.date.toLocaleDateString('vi-VN', {
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
