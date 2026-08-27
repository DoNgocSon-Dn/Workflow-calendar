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
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsISO8601()
  start!: string;

  @IsISO8601()
  end!: string;

  @IsBoolean()
  allDay!: boolean;

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
