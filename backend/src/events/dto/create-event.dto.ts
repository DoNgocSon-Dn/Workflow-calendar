import { Type } from 'class-transformer';
import {
  IsBoolean,
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
  meetLink?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceRuleDto)
  recurrenceRule?: RecurrenceRuleDto;
}
