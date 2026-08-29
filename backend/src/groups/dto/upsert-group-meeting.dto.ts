import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsDateString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Tạo hoặc sửa phòng họp của nhóm (1 phòng / nhóm — PUT là upsert). */
export class UpsertGroupMeetingDto {
  @IsNotEmpty()
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  link: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  durationMin?: number;
}
