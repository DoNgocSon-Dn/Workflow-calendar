import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateTodoListDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;
}
