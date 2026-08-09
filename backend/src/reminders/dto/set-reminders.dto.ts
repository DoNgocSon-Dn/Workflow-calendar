import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, Min, ValidateNested } from 'class-validator';

export class ReminderItemDto {
  @IsInt()
  @Min(0)
  offsetMinutes!: number;

  @IsIn(['popup', 'email'])
  type!: 'popup' | 'email';
}

export class SetRemindersDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ReminderItemDto)
  reminders!: ReminderItemDto[];
}
