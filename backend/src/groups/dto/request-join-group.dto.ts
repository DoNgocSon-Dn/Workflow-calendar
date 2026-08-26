import { IsNotEmpty, IsUUID } from 'class-validator';

export class RequestJoinGroupDto {
  @IsNotEmpty()
  @IsUUID()
  token: string;
}
