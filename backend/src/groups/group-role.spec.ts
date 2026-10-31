import {
  ASSIGNABLE_GROUP_ROLES,
  GroupRole,
  canAssignRole,
  canChat,
  canInvite,
  canManage,
  normalizeGroupRole,
} from './group-role';

describe('group permission contract', () => {
  it('retains guests and treats unknown database values as read-only', () => {
    expect(normalizeGroupRole('guest')).toBe(GroupRole.GUEST);
    expect(normalizeGroupRole('unexpected')).toBe(GroupRole.GUEST);
    expect(normalizeGroupRole('member')).toBe(GroupRole.MEMBER);
    expect(normalizeGroupRole('owner')).toBe(GroupRole.LEADER);
    expect(canChat(GroupRole.GUEST)).toBe(false);
    expect(canChat(GroupRole.MEMBER)).toBe(true);
  });
  it.each(Object.values(GroupRole))(
    '%s cannot manage or assign a peer or superior',
    (actor) => {
      expect(canManage(actor, actor)).toBe(false);
      expect(canAssignRole(actor, actor)).toBe(false);
      expect(canAssignRole(actor, GroupRole.LEADER)).toBe(false);
      expect(canManage(actor, GroupRole.LEADER)).toBe(false);
    },
  );
  it('only managers can manage guests or invite people', () => {
    expect(canManage(GroupRole.MEMBER, GroupRole.GUEST)).toBe(false);
    expect(canAssignRole(GroupRole.MEMBER, GroupRole.GUEST)).toBe(false);
    expect(canInvite(GroupRole.MEMBER)).toBe(false);
    expect(canManage(GroupRole.ADMIN, GroupRole.GUEST)).toBe(true);
    expect(canAssignRole(GroupRole.ADMIN, GroupRole.MEMBER)).toBe(true);
    expect(canAssignRole(GroupRole.LEADER, GroupRole.ADMIN)).toBe(true);
    expect(ASSIGNABLE_GROUP_ROLES).toContain(GroupRole.GUEST);
  });
});
