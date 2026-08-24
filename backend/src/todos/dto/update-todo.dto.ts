import { IsBoolean, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateTodoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
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
