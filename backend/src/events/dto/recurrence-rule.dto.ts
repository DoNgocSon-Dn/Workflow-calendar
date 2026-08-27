import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export type RecurrenceFreq =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'monthly_nth_weekday'
  | 'monthly_last_weekday'
  | 'yearly'
  | 'weekdays'
  | 'custom';

export type RecurrenceEndType = 'never' | 'until' | 'count';
export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';

export class RecurrenceRuleDto {
  @IsIn([
    'daily',
    'weekly',
    'monthly',
    'monthly_nth_weekday',
    'monthly_last_weekday',
    'yearly',
    'weekdays',
    'custom',
  ])
  freq!: RecurrenceFreq;

  /** Chỉ dùng khi freq = 'custom' — "lặp lại mỗi N ngày/tuần/tháng/năm". */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  interval?: number;

  /** Chỉ dùng khi freq = 'custom' — đơn vị của interval ở trên. */
  @IsOptional()
  @IsIn(['day', 'week', 'month', 'year'])
  unit?: RecurrenceUnit;

  /** Chỉ dùng khi freq = 'custom' và unit = 'week' — các thứ trong tuần lặp lại (0 = CN .. 6 = Thứ Bảy). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  byWeekdays?: number[];

  @IsOptional()
  @IsIn(['never', 'until', 'count'])
  endType?: RecurrenceEndType;

  @IsOptional()
  @IsISO8601()
  until?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(730)
  count?: number;
}
