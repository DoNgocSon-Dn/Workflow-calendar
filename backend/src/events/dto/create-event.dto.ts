import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { RecurrenceRuleDto } from './recurrence-rule.dto';

export class CreateEventDto {
  @IsUUID()
  calendarId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  // Nới rộng: mô tả sự kiện import (Google Calendar…) hay kèm link họp + chỉ
  // dẫn, thường vài nghìn ký tự. Cột DB là `text` nên không có trần cứng.
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsISO8601()
  start!: string;

  @IsISO8601()
  end!: string;

  @IsBoolean()
  allDay!: boolean;

  /** Tên múi giờ IANA sự kiện thuộc về (vd 'America/New_York'). Bỏ trống ⇒ sự
   *  kiện hiển thị theo múi giờ người xem (hành vi cũ). `start`/`end` luôn là
   *  mốc UTC bất kể giá trị này. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  startTz?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  meetLink?: string;

  /** Loại lịch của sự kiện người dùng: 'solar' (Dương) mặc định, 'lunar' (Âm).
   *  Quyết định sự kiện xuất hiện trong "Lịch Dương" hay "Lịch Âm". */
  @IsOptional()
  @IsIn(['solar', 'lunar'])
  calendarType?: 'solar' | 'lunar';

  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceRuleDto)
  recurrenceRule?: RecurrenceRuleDto;
}
