export interface ContactProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}
export interface Friendship {
  id: string;
  profile: ContactProfile;
}
export interface DirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  clientId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}
export interface Conversation {
  profile: ContactProfile;
  lastMessage: DirectMessage | null;
  unreadCount: number;
  canMessage: boolean;
  blockedByMe: boolean;
}
export interface SocialOverview {
  friends: Friendship[];
  incoming: Friendship[];
  outgoing: Friendship[];
  conversations: Conversation[];
}
export interface MessagePage {
  messages: DirectMessage[];
  hasMore: boolean;
}
export const emptyOverview = (): SocialOverview => ({
  friends: [],
  incoming: [],
  outgoing: [],
  conversations: [],
});
