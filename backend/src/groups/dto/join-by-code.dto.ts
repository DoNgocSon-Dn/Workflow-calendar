import { IsNotEmpty, IsString, Length } from 'class-validator';

export class JoinByCodeDto {
  @IsNotEmpty()
  @IsString()
  @Length(4, 16)
  code: string;
}
