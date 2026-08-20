import { IsEmail, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class InviteGroupMemberDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsOptional()
  @IsIn(['admin', 'member', 'guest'])
  role?: string;
}
