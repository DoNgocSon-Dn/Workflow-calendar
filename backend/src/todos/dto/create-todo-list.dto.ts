import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateTodoListDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;
}
