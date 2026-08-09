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
    const columnOf = new Map<string, number>();
    for (const e of cluster) {
      let col = columnEndTimes.findIndex((end) => end <= e.start.getTime());
      if (col === -1) {
        col = columnEndTimes.length;
        columnEndTimes.push(e.end.getTime());
      } else {
        columnEndTimes[col] = e.end.getTime();
      }
      columnOf.set(e.id, col);
    }
    const colCount = columnEndTimes.length;
    for (const e of cluster) {
      const col = columnOf.get(e.id) ?? 0;
      const top = (minutesSinceMidnight(e.start) / 60) * hourHeight;
      const height = Math.max((diffMinutes(e.start, e.end) / 60) * hourHeight, MIN_BLOCK_HEIGHT);
      result.push({
        event: e,
        top,
        height,
        leftPct: (col / colCount) * 100,
        widthPct: (1 / colCount) * 100,
      });
    }
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
