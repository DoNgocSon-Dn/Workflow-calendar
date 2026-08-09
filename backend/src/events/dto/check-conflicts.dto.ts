import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class CheckConflictsDto {
  @IsISO8601()
  start!: string;

  @IsISO8601()
  end!: string;

  @IsOptional()
  @IsUUID()
  excludeEventId?: string;
}
