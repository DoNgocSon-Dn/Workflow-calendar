import { GroupRole } from './group-role';

export type GroupColor = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'teal';

export const GROUP_COLORS: readonly GroupColor[] = ['blue', 'green', 'orange', 'red', 'purple', 'teal'];

export const GROUP_COLOR_HEX: Record<GroupColor, string> = {
  blue: '#2563eb',
  green: '#16a34a',
  orange: '#ea580c',
  red: '#dc2626',
  purple: '#7c3aed',
  teal: '#0891b2',
};

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
  role: GroupRole;
  createdAt: string;
  email?: string;
  name?: string;
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

export interface GroupInviteLink {
  token: string;
  groupId: string;
  role: string;
  createdBy: string | null;
  createdAt: string;
}

export type GroupJoinRequestStatus = 'pending' | 'approved' | 'declined';

export interface GroupJoinRequest {
  id: string;
  groupId: string;
  userId: string;
  role: string;
  status: GroupJoinRequestStatus;
  createdAt: string;
  requesterEmail?: string;
  requesterName?: string;
}

export interface GroupInviteLinkPreview {
  groupId: string;
  groupName: string;
  groupDescription?: string;
  groupColor: string;
  role: string;
  isMember: boolean;
  myPendingRequestId: string | null;
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

/**
 * Một lượt nhắc tên trong tin nhắn.
 *
 * Lưu kèm tin nhắn dưới dạng metadata (cột `mentions` jsonb) thay vì để giao
 * diện dò chuỗi "@..." sau khi gửi: dò chuỗi không biết userId nào ứng với
 * tên nào, chết khi hai người trùng tên, và vỡ hẳn khi người được nhắc đổi
 * tên hiển thị.
 */
export interface GroupMessageMention {
  type: 'user' | 'all';
  /** Chỉ có với type='user'. */
  userId?: string;
  /** Tên hiển thị tại thời điểm gửi — dùng để tô đúng đoạn chữ trong nội dung. */
  label: string;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  message: string | null;
  mentions?: GroupMessageMention[];
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
  senderEmail?: string;
  senderName?: string;
  /**
   * Mã do client sinh ra trước khi gọi API, dùng để ghép tin nhắn lạc quan
   * (hiện ngay lúc nhấn Enter) với tin nhắn thật do server trả về / socket
   * đẩy tới. Không được lưu xuống DB — nó chỉ sống trong bộ nhớ của phiên gửi.
   */
  clientMessageId?: string;
  /** Đang chờ server xác nhận. Chỉ đúng với tin nhắn lạc quan. */
  pending?: boolean;
}

export interface GroupMessageAttachment {
  url: string;
  name: string;
  type: string;
  size: number;
}
