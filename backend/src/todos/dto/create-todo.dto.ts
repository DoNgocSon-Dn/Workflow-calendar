import { IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTodoDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsUUID()
  listId!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;
}
