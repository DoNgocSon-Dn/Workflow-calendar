import { IsNotEmpty, IsOptional, IsString, IsIn } from 'class-validator';

export class CreateGroupDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['blue', 'green', 'orange', 'red', 'purple', 'teal'])
  color?: string;
}
