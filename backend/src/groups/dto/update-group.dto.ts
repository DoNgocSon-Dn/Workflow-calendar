import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateGroupDto {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(['blue', 'green', 'orange', 'red', 'purple', 'teal'])
  color?: string;
}
