import { CalendarEvent } from '../models/calendar.models';
import { addDays, diffMinutes, minutesSinceMidnight, startOfDay } from './date-utils';

export interface PositionedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
}

const MIN_BLOCK_HEIGHT = 18;

/**
 * Giờ kết thúc dùng ĐỂ XẾP CHỖ, không phải giờ kết thúc thật.
 *
 * Khối được kéo cao tối thiểu `MIN_BLOCK_HEIGHT` để còn bấm được, nên một sự
 * kiện 5 phút chiếm chỗ trên lưới đúng bằng ~22 phút. Nếu xếp chỗ theo giờ
 * thật thì hai sự kiện 9:00-9:05 và 9:05-9:10 bị coi là không trùng, cùng nhận
 * 100% bề ngang, rồi vẽ ra thì khối sau đè lên khối trước — đúng cái hiện
 * tượng "sự kiện chồng lên nhau" cần dẹp. Xếp theo chiều cao THẬT SỰ ĐƯỢC VẼ
 * thì chúng tự tách thành hai cột.
 */
function layoutEndTime(event: CalendarEvent, hourHeight: number): number {
  const minDurationMs = (MIN_BLOCK_HEIGHT / hourHeight) * 60 * 60 * 1000;
  return Math.max(event.end.getTime(), event.start.getTime() + minDurationMs);
}

/** Hai sự kiện có phần thời gian giao nhau không. Chạm đầu-đuôi (9:00-10:00 và
 *  10:00-11:00) KHÔNG tính là trùng — chúng xếp chồng dọc được. */
function overlapsInTime(
  a: CalendarEvent,
  b: CalendarEvent,
  layoutEnd: ReadonlyMap<CalendarEvent, number>,
): boolean {
  return (
    a.start.getTime() < layoutEnd.get(b)! && b.start.getTime() < layoutEnd.get(a)!
  );
}

/**
 * Số cột liền kề bên phải mà một sự kiện được phép nong ra.
 *
 * Thiếu bước này thì mọi khối trong cùng một cụm đều bị ép về đúng
 * `1/colCount`: một cụm phải mở 3 cột chỉ vì hai sự kiện buổi chiều chồng nhau
 * sẽ làm sự kiện buổi sáng — vốn không đụng ai — teo còn 1/3 bề ngang và chừa
 * hai khoảng trống vô nghĩa. Google Calendar nong khối sang phải cho tới khi
 * chạm cột đầu tiên có sự kiện thật sự trùng giờ.
 */
function columnSpan(
  event: CalendarEvent,
  columns: readonly CalendarEvent[][],
  col: number,
  layoutEnd: ReadonlyMap<CalendarEvent, number>,
): number {
  let span = 1;
  for (let next = col + 1; next < columns.length; next++) {
    if (columns[next].some((other) => overlapsInTime(event, other, layoutEnd))) break;
    span++;
  }
  return span;
}

/**
 * Greedy column-packing layout: events overlapping in time share the
 * available column width side by side, like Google Calendar's day/week grid.
 *
 * Hai bước: (1) xếp mỗi sự kiện vào cột trống sớm nhất, (2) nong khối sang
 * phải qua những cột không có ai trùng giờ (xem `columnSpan`). Bước (2) là thứ
 * giữ cho các khối dùng hết bề ngang cột ngày mà vẫn KHÔNG đè lên nhau — nhờ
 * vậy phần hiển thị không cần tới màu trong suốt để nhìn xuyên khối bên dưới,
 * và mỗi khối giữ đúng màu đục của lịch nó thuộc về.
 *
 * `day` là cột NGÀY đang vẽ — mỗi sự kiện chỉ nằm trong cột của ngày chứa
 * `event.start` (bộ lọc ở nơi gọi), nhưng nếu `event.end` tràn qua nửa đêm
 * sang ngày sau, chiều cao khối KHÔNG được tính theo tổng thời lượng thật
 * (sẽ vẽ tràn quá mốc 24h/23h xuống dưới đáy cột) — phải cắt tại đúng 24:00
 * của `day` này. Việc gộp cột theo giờ trùng nhau (columnEndTimes/clusterEnd)
 * vẫn dùng giờ kết thúc THẬT, chỉ chiều cao hiển thị mới bị cắt.
 */
export function layoutDayEvents(
  events: CalendarEvent[],
  hourHeight: number,
  day: Date,
): PositionedEvent[] {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);

  const effectiveRanges = new Map<
    CalendarEvent,
    { start: Date; end: Date; startMs: number; endMs: number; layoutEndMs: number }
  >();

  for (const e of events) {
    const startMs = Math.max(e.start.getTime(), dayStart.getTime());
    const endMs = Math.min(e.end.getTime(), dayEnd.getTime());
    const start = new Date(startMs);
    const end = new Date(endMs);
    const minDurationMs = (MIN_BLOCK_HEIGHT / hourHeight) * 60 * 60 * 1000;
    const layoutEndMs = Math.max(endMs, startMs + minDurationMs);
    effectiveRanges.set(e, { start, end, startMs, endMs, layoutEndMs });
  }

  const timed = [...events].sort((a, b) => {
    const ra = effectiveRanges.get(a)!;
    const rb = effectiveRanges.get(b)!;
    const start = ra.startMs - rb.startMs;
    if (start !== 0) return start;
    return (rb.endMs - rb.startMs) - (ra.endMs - ra.startMs);
  });

  const result: PositionedEvent[] = [];
  let cluster: CalendarEvent[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;

    const columns: CalendarEvent[][] = [];
    const columnEndTimes: number[] = [];
    const columnOfIndex: number[] = [];
    for (const e of cluster) {
      const range = effectiveRanges.get(e)!;
      let col = columnEndTimes.findIndex((end) => end <= range.startMs);
      if (col === -1) {
        col = columnEndTimes.length;
        columnEndTimes.push(range.layoutEndMs);
        columns.push([e]);
      } else {
        columnEndTimes[col] = range.layoutEndMs;
        columns[col].push(e);
      }
      columnOfIndex.push(col);
    }

    const colCount = columns.length;
    cluster.forEach((e, index) => {
      const range = effectiveRanges.get(e)!;
      const col = columnOfIndex[index];
      let span = 1;
      for (let next = col + 1; next < columns.length; next++) {
        if (
          columns[next].some((other) => {
            const rother = effectiveRanges.get(other)!;
            return range.startMs < rother.layoutEndMs && rother.startMs < range.layoutEndMs;
          })
        ) {
          break;
        }
        span++;
      }

      const top = (minutesSinceMidnight(range.start) / 60) * hourHeight;
      const height = Math.max(
        (diffMinutes(range.start, range.end) / 60) * hourHeight,
        MIN_BLOCK_HEIGHT,
      );

      result.push({
        event: e,
        top,
        height,
        leftPct: (col / colCount) * 100,
        widthPct: (span / colCount) * 100,
      });
    });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const e of timed) {
    const range = effectiveRanges.get(e)!;
    if (cluster.length && range.startMs >= clusterEnd) {
      flush();
    }
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, range.layoutEndMs);
  }
  flush();

  return result;
}
