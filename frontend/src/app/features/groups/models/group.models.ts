export interface Group {
  id: string;
  name: string;
  description?: string;
  color: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'teal';
  ownerId: string;
  calendarId: string;
  createdAt: string;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'guest';
  createdAt: string;
  email?: string;
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
