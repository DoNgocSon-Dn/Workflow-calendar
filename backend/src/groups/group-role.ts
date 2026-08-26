/**
 * Nguồn sự thật DUY NHẤT cho vai trò trong nhóm.
 *
 * Ba cấp, xếp theo thứ bậc: LEADER > ADMIN > MEMBER.
 * Tên hiển thị (Trưởng nhóm / Quản trị viên / Thành viên) do frontend dịch từ
 * chính ba khoá này — backend không bao giờ trả chữ tiếng Việt cho role.
 *
 * KHÔNG dùng 'OWNER' cho vai trò này. GUEST là cấp thấp nhất — chỉ xem,
 * không nhắn tin (xem migration 18).
 */
export const GroupRole = {
  LEADER: 'LEADER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  GUEST: 'GUEST',
} as const;

export type GroupRole = (typeof GroupRole)[keyof typeof GroupRole];

/** Vai trò được phép gán khi mời hoặc đổi quyền. LEADER cố tình vắng mặt:
 *  không ai được mời thẳng vào làm trưởng nhóm, cũng không tự phong được —
 *  ghế đó chỉ đổi chủ qua luồng chuyển quyền riêng. */
export const ASSIGNABLE_GROUP_ROLES: readonly GroupRole[] = [
  GroupRole.ADMIN,
  GroupRole.MEMBER,
  GroupRole.GUEST,
];

/** Vai trò mặc định khi mời người mới. */
export const DEFAULT_GROUP_ROLE: GroupRole = GroupRole.MEMBER;

/**
 * Thứ bậc dạng số để so sánh. Chỉ dùng nội bộ trong file này — nơi khác so
 * sánh bằng `canManage()` chứ không tự đọc số, tránh việc mỗi chỗ tự định
 * nghĩa lại "cao hơn" một kiểu.
 */
const RANK: Readonly<Record<GroupRole, number>> = {
  [GroupRole.LEADER]: 4,
  [GroupRole.ADMIN]: 3,
  [GroupRole.MEMBER]: 2,
  [GroupRole.GUEST]: 1,
};

/** GUEST chỉ được xem — không nhắn tin, không tạo/sửa task. */
export function canChat(actor: GroupRole): boolean {
  return actor !== GroupRole.GUEST;
}

/**
 * Chuẩn hoá giá trị role đọc từ database về đúng ba khoá trên.
 *
 * Dữ liệu cũ dùng 'owner' và 'guest'; migration 15 đã đổi chúng sang
 * 'leader'/'member', nhưng hàm này vẫn nhận cả hai dạng để bản build mới không
 * vỡ nếu chạy trước khi migration được áp. Giá trị lạ rơi về MEMBER — cấp thấp
 * nhất — vì đoán nhầm theo hướng ÍT quyền hơn thì an toàn, còn đoán nhầm theo
 * hướng nhiều quyền hơn là lỗ hổng.
 */
export function normalizeGroupRole(raw: string | null | undefined): GroupRole {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'leader':
    case 'owner':
      return GroupRole.LEADER;
    case 'admin':
      return GroupRole.ADMIN;
    case 'guest':
      return GroupRole.GUEST;
    default:
      return GroupRole.MEMBER;
  }
}

/**
 * Giá trị ghi xuống database. Cột `group_members.role` dùng chữ thường (ràng
 * buộc CHECK trong migration), nên đây là điểm chuyển đổi DUY NHẤT giữa khoá
 * ứng dụng và giá trị lưu trữ.
 */
export function toDbGroupRole(role: GroupRole): string {
  return role.toLowerCase();
}

/** `actor` có quyền thao tác lên `target` không (đổi quyền, xoá khỏi nhóm). */
export function canManage(actor: GroupRole, target: GroupRole): boolean {
  // Phải THỰC SỰ cao hơn, không phải bằng: hai quản trị viên ngang cấp không
  // được đụng vào nhau, và không ai đụng được vào trưởng nhóm.
  return RANK[actor] > RANK[target];
}

/** `actor` có được mời người mới vào nhóm không. */
export function canInvite(actor: GroupRole): boolean {
  return RANK[actor] >= RANK[GroupRole.ADMIN];
}

/** `actor` có được gán vai trò `role` cho người khác không. */
export function canAssignRole(actor: GroupRole, role: GroupRole): boolean {
  // Không ai gán được LEADER qua đường phân quyền thường.
  if (!ASSIGNABLE_GROUP_ROLES.includes(role)) return false;
  // Không được nâng người khác lên ngang hoặc cao hơn chính mình.
  return RANK[actor] > RANK[role];
}
