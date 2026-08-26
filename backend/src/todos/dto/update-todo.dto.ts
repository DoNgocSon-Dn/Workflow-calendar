import { IsBoolean, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateTodoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  content?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @IsUUID()
  listId?: string;

  @IsOptional()
  @IsBoolean()
  starred?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  /** Xoá hẳn thời hạn đã đặt — không thể phân biệt "không đổi" và "xoá" chỉ
   *  bằng dueAt undefined, nên cần cờ riêng. */
  @IsOptional()
  @IsBoolean()
  clearDueAt?: boolean;
}
