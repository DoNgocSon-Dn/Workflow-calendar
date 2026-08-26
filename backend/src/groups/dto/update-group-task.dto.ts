import { IsOptional, IsString, IsIn, IsDateString, MaxLength } from 'class-validator';

export class UpdateGroupTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(['todo', 'in_progress', 'done'])
  status?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
