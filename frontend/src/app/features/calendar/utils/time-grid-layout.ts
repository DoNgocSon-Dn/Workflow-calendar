import { CalendarEvent } from '../models/calendar.models';
import { diffMinutes, minutesSinceMidnight } from './date-utils';

export interface PositionedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
}

const MIN_BLOCK_HEIGHT = 18;

/**
 * Greedy column-packing layout: events overlapping in time share the
 * available column width side by side, like Google Calendar's day/week grid.
 */
export function layoutDayEvents(
  events: CalendarEvent[],
  hourHeight: number,
): PositionedEvent[] {
  const timed = [...events].sort((a, b) => {
    const start = a.start.getTime() - b.start.getTime();
    if (start !== 0) return start;
    return (b.end.getTime() - b.start.getTime()) - (a.end.getTime() - a.start.getTime());
  });

  const result: PositionedEvent[] = [];
  let cluster: CalendarEvent[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    const columnEndTimes: number[] = [];
    // Đánh số cột theo VỊ TRÍ trong cluster, không theo id.
    //
    // Trước đây dùng Map<id, cột>: hai bản ghi trùng id (xảy ra khi cùng một
    // sự kiện lọt vào danh sách hai lần) sẽ ghi đè nhau, nên cả hai cùng nhận
    // số cột của bản ghi sau — kết quả là MỘT khối vẽ lệch sang nửa phải như
    // thể đang trùng giờ, dù người dùng chỉ thấy một sự kiện.
    const columnOfIndex: number[] = [];
    for (const e of cluster) {
      let col = columnEndTimes.findIndex((end) => end <= e.start.getTime());
      if (col === -1) {
        col = columnEndTimes.length;
        columnEndTimes.push(e.end.getTime());
      } else {
        columnEndTimes[col] = e.end.getTime();
      }
      columnOfIndex.push(col);
    }
    const colCount = columnEndTimes.length;
    cluster.forEach((e, index) => {
      const col = columnOfIndex[index];
      const top = (minutesSinceMidnight(e.start) / 60) * hourHeight;
      const height = Math.max((diffMinutes(e.start, e.end) / 60) * hourHeight, MIN_BLOCK_HEIGHT);
      result.push({
        event: e,
        top,
        height,
        leftPct: (col / colCount) * 100,
        widthPct: (1 / colCount) * 100,
      });
    });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const e of timed) {
    if (cluster.length && e.start.getTime() >= clusterEnd) {
      flush();
    }
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, e.end.getTime());
  }
  flush();

  return result;
}
