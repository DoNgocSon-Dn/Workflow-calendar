import { IsEmail, IsNotEmpty, IsOptional, IsIn, MaxLength } from 'class-validator';
import { ASSIGNABLE_GROUP_ROLES } from '../group-role';

/**
 * `LEADER` cố tình không nằm trong danh sách hợp lệ: không ai được mời thẳng
 * vào làm trưởng nhóm. Chấp nhận cả chữ hoa lẫn chữ thường để client cũ (gửi
 * 'member') và client mới (gửi 'MEMBER') đều dùng được.
 */
const ALLOWED_ROLES = [
  ...ASSIGNABLE_GROUP_ROLES,
  ...ASSIGNABLE_GROUP_ROLES.map((r) => r.toLowerCase()),
];

export class InviteGroupMemberDto {
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsOptional()
  @IsIn(ALLOWED_ROLES)
  role?: string;
}
