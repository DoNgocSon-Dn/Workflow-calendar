import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { RecurrenceRuleDto } from './recurrence-rule.dto';

export class CreateEventDto {
  @IsUUID()
  calendarId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
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
