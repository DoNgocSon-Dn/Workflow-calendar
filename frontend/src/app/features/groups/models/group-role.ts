/**
 * Vai trò trong nhóm — bản đối chiếu của `backend/src/groups/group-role.ts`.
 *
 * Ba cấp theo thứ bậc: LEADER > ADMIN > MEMBER.
 * Giao diện KHÔNG bao giờ hiển thị các khoá này; chúng được dịch qua
 * `groupRole.*` trong từ điển i18n (Trưởng nhóm / Quản trị viên / Thành viên).
 *
 * KHÔNG dùng 'OWNER'. GUEST là cấp thấp nhất — chỉ xem, không nhắn tin.
 */
export const GroupRole = {
  LEADER: 'LEADER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  GUEST: 'GUEST',
} as const;

export type GroupRole = (typeof GroupRole)[keyof typeof GroupRole];

/** Vai trò chọn được khi mời hoặc đổi quyền. LEADER vắng mặt có chủ đích:
 *  ghế trưởng nhóm chỉ đổi chủ qua chức năng chuyển quyền riêng. */
export const ASSIGNABLE_GROUP_ROLES: readonly GroupRole[] = [
  GroupRole.ADMIN,
  GroupRole.MEMBER,
  GroupRole.GUEST,
];

export const DEFAULT_GROUP_ROLE: GroupRole = GroupRole.MEMBER;

const RANK: Readonly<Record<GroupRole, number>> = {
  [GroupRole.LEADER]: 4,
  [GroupRole.ADMIN]: 3,
  [GroupRole.MEMBER]: 2,
  [GroupRole.GUEST]: 1,
};

/**
 * Ép giá trị role bất kỳ về đúng ba khoá trên.
 *
 * Nhận cả 'owner'/'guest' của dữ liệu cũ để giao diện không vỡ nếu migration
 * chưa được áp. Giá trị lạ rơi về MEMBER — đoán nhầm theo hướng ÍT quyền hơn
 * thì an toàn.
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
 * Khoá i18n cho tên vai trò. Không hard-code chữ tiếng Việt trong component —
 * đổi ngôn ngữ sau này chỉ cần thêm bản dịch, không phải sửa từng chỗ.
 */
export function groupRoleLabelKey(role: GroupRole): string {
  return `groupRole.${role.toLowerCase()}`;
}

/** `actor` có quyền thao tác lên `target` không. Phải khớp `canManage` ở backend. */
export function canManage(actor: GroupRole | null, target: GroupRole): boolean {
  if (!actor) return false;
  return RANK[actor] > RANK[target];
}

export function canInvite(actor: GroupRole | null): boolean {
  return !!actor && RANK[actor] >= RANK[GroupRole.ADMIN];
}

export function canAssignRole(actor: GroupRole | null, role: GroupRole): boolean {
  if (!actor) return false;
  if (!ASSIGNABLE_GROUP_ROLES.includes(role)) return false;
  return RANK[actor] > RANK[role];
}

/** Chỉ trưởng nhóm mới chuyển được ghế của mình. */
export function canTransferLeadership(actor: GroupRole | null): boolean {
  return actor === GroupRole.LEADER;
}

/** GUEST chỉ được xem — không nhắn tin, không tạo/sửa task. Phải khớp canChat ở backend. */
export function canChat(actor: GroupRole | null): boolean {
  return !!actor && actor !== GroupRole.GUEST;
}

/** Chỉ Trưởng nhóm (LEADER) và Phó nhóm (ADMIN) mới được xem/quản lý Lịch Nhóm. */
export function canSeeGroupCalendar(actor: GroupRole | null): boolean {
  return !!actor && (actor === GroupRole.LEADER || actor === GroupRole.ADMIN);
}

/** Khách (GUEST) không được xem cuộc trò chuyện nhóm. */
export function canSeeGroupChat(actor: GroupRole | null): boolean {
  return !!actor && actor !== GroupRole.GUEST;
}
