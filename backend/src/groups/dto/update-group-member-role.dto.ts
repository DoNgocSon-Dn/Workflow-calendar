import { IsIn, IsNotEmpty } from 'class-validator';
import { ASSIGNABLE_GROUP_ROLES } from '../group-role';

/** Xem chú thích trong invite-group-member.dto.ts — `LEADER` bị loại có chủ đích. */
const ALLOWED_ROLES = [
  ...ASSIGNABLE_GROUP_ROLES,
  ...ASSIGNABLE_GROUP_ROLES.map((r) => r.toLowerCase()),
];

export class UpdateGroupMemberRoleDto {
  @IsNotEmpty()
  @IsIn(ALLOWED_ROLES)
  role: string;
}
