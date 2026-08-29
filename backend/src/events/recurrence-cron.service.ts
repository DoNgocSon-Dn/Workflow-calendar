import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseClient } from '@supabase/supabase-js';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SupabaseService } from '../supabase/supabase.service';
import { RecurrenceRuleDto } from './dto/recurrence-rule.dto';
import { EventDto, EventRow, toEventDto } from './event.mapper';
import {
  RECURRENCE_TOPUP_HORIZON_DAYS,
  expandRecurrence,
} from './recurrence.util';

/** Số hàng tạo thêm tối đa cho MỘT chuỗi trong một lần chạy — chặn trường hợp
 *  rule kỳ quặc (lặp mỗi phút...) làm phình bảng. 400 ngày lặp hằng ngày ≈ 400. */
const MAX_TOPUP_PER_SERIES = 450;

type SeriesTemplateRow = Pick<
  EventRow,
  | 'series_id'
  | 'start_at'
  | 'end_at'
  | 'recurrence_rule'
  | 'calendar_id'
  | 'title'
  | 'description'
  | 'location'
  | 'all_day'
  | 'created_by'
  | 'meet_link'
  | 'calendar_type'
  | 'start_tz'
>;

const SERIES_COLUMNS =
  'series_id, start_at, end_at, recurrence_rule, calendar_id, title, description, location, all_day, created_by, meet_link, calendar_type, start_tz';

/**
 * "Lặp lại không kết thúc" thực chất chỉ được vật chất hoá ~2 năm khi tạo. Cron
 * này chạy mỗi ngày, nối thêm các lần lặp còn thiếu cho mọi chuỗi đang mở tới
 * mốc now + 400 ngày, bỏ qua những buổi đã bị xoá lẻ (EXDATE ở bảng
 * event_recurrence_exceptions).
 */
@Injectable()
export class RecurrenceCronService {
  private readonly logger = new Logger(RecurrenceCronService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async topUpSeries(): Promise<void> {
    const supabase = this.supabaseService.getServiceRoleClient();
    const now = new Date();
    const horizon = new Date(now.getTime() + RECURRENCE_TOPUP_HORIZON_DAYS * 86_400_000);

    const { data, error } = await supabase
      .from('events')
      .select(SERIES_COLUMNS)
      .not('series_id', 'is', null)
      .not('recurrence_rule', 'is', null)
      .is('deleted_at', null)
      .returns<SeriesTemplateRow[]>();

    if (error) {
      this.logger.error(`Không đọc được chuỗi lặp: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) return;

    const bySeries = new Map<string, SeriesTemplateRow[]>();
    for (const row of data) {
      if (!row.series_id) continue;
      const list = bySeries.get(row.series_id);
      if (list) list.push(row);
      else bySeries.set(row.series_id, [row]);
    }

    let created = 0;
    for (const [seriesId, rows] of bySeries) {
      try {
        created += await this.topUpOne(supabase, seriesId, rows, horizon);
      } catch (err) {
        this.logger.warn(`Top-up chuỗi ${seriesId} lỗi: ${(err as Error).message}`);
      }
    }
    if (created > 0) this.logger.log(`Đã nối thêm ${created} lần lặp cho các chuỗi.`);
  }

  private async topUpOne(
    supabase: SupabaseClient,
    seriesId: string,
    rows: SeriesTemplateRow[],
    horizon: Date,
  ): Promise<number> {
    const template = rows.reduce((a, b) => (a.start_at <= b.start_at ? a : b));
    const rule = template.recurrence_rule as RecurrenceRuleDto | null;
    if (!rule) return 0;

    // Chuỗi có số lần cố định đã tạo đủ khi tạo — không nối thêm.
    if (rule.endType === 'count' && rule.count && rows.length >= rule.count) return 0;
    // Chuỗi có ngày kết thúc đã qua mốc lần lặp mới nhất — không còn gì để thêm.
    const latestStartMs = rows.reduce((m, r) => Math.max(m, Date.parse(r.start_at)), 0);
    if (rule.endType === 'until' && rule.until && Date.parse(rule.until) <= latestStartMs) {
      return 0;
    }
    if (latestStartMs >= horizon.getTime()) return 0;

    const { data: exRows } = await supabase
      .from('event_recurrence_exceptions')
      .select('occurred_at')
      .eq('series_id', seriesId)
      .returns<{ occurred_at: string }[]>();
    const excluded = new Set<number>((exRows ?? []).map((r) => Date.parse(r.occurred_at)));
    const existing = new Set<number>(rows.map((r) => Date.parse(r.start_at)));

    const occurrences = expandRecurrence(
      new Date(template.start_at),
      new Date(template.end_at),
      rule,
      { after: new Date(latestStartMs), until: horizon, excluded, max: MAX_TOPUP_PER_SERIES },
    ).filter((occ) => !existing.has(occ.start.getTime()));

    if (occurrences.length === 0) return 0;

    const insertRows = occurrences.map((occ) => ({
      calendar_id: template.calendar_id,
      title: template.title,
      location: template.location,
      description: template.description,
      start_at: occ.start.toISOString(),
      end_at: occ.end.toISOString(),
      start_tz: template.start_tz,
      all_day: template.all_day,
      created_by: template.created_by,
      meet_link: template.meet_link,
      series_id: seriesId,
      recurrence_rule: rule,
      calendar_type: template.calendar_type,
    }));

    const { data: inserted, error } = await supabase
      .from('events')
      .insert(insertRows)
      .select('*')
      .returns<EventRow[]>();
    if (error) throw new Error(error.message);

    const dtos: EventDto[] = (inserted ?? []).map(toEventDto);
    if (dtos.length > 0) {
      this.realtimeGateway.emitToCalendar(template.calendar_id, 'events:bulk-created', {
        calendarId: template.calendar_id,
        events: dtos,
      });
    }
    return dtos.length;
  }
}
