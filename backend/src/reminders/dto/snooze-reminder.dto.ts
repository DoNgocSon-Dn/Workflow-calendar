import { IsInt, Max, Min } from 'class-validator';

export class SnoozeReminderDto {
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  minutes!: number;
}
