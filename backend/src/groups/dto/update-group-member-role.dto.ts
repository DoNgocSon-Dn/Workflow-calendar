import { IsIn, IsNotEmpty } from 'class-validator';

export class UpdateGroupMemberRoleDto {
  @IsNotEmpty()
  @IsIn(['admin', 'member', 'guest'])
  role: string;
}
