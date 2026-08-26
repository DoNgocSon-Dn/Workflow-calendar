import { IsOptional, IsIn } from 'class-validator';
import { ASSIGNABLE_GROUP_ROLES } from '../group-role';

/** `LEADER` cố tình không nằm trong danh sách hợp lệ — cùng lý do với
 *  InviteGroupMemberDto: không ai được cấp quyền trưởng nhóm qua đây. */
const ALLOWED_ROLES = [
  ...ASSIGNABLE_GROUP_ROLES,
  ...ASSIGNABLE_GROUP_ROLES.map((r) => r.toLowerCase()),
];

export class CreateInviteLinkDto {
  @IsOptional()
  @IsIn(ALLOWED_ROLES)
  role?: string;
}
