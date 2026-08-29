import { ArrayMaxSize, IsArray, IsInt, Max, Min } from 'class-validator';

export class SetReminderPreferencesDto {
  @IsArray()
  @ArrayMaxSize(12)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(40320, { each: true }) // 28 ngày
  offsets!: number[];
}
