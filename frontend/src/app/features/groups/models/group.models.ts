export type GroupColor = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'teal';

export interface Group {
  id: string;
  name: string;
  description?: string;
  color: GroupColor;
  ownerId: string;
  calendarId: string;
  createdAt: string;
  /** Người này đã ẩn nhóm khỏi sidebar của mình — không ảnh hưởng người khác. */
  hidden?: boolean;
}

export interface GroupUpdate {
  name?: string;
  description?: string;
  color?: GroupColor;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'guest';
  createdAt: string;
  email?: string;
}

export type GroupInviteStatus = 'pending' | 'accepted' | 'declined';

export interface GroupInvite {
  id: string;
  groupId: string;
  groupName: string;
  groupColor: string;
  role: string;
  status: GroupInviteStatus;
  createdAt: string;
  inviterEmail: string | null;
}

export interface GroupTask {
  id: string;
  groupId: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  assignedTo?: string;
  dueDate?: string;
  createdBy?: string;
  createdAt: string;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  message: string | null;
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
  senderEmail?: string;
}

export interface GroupMessageAttachment {
  url: string;
  name: string;
  type: string;
  size: number;
}
