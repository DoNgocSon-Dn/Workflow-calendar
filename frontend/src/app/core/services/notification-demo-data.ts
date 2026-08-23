import { AppNotification } from './notification.model';

/**
 * DỮ LIỆU DEMO — tách hẳn khỏi luồng production.
 *
 * Đây KHÔNG phải dữ liệu realtime. Mọi loại thông báo giờ đều đã có nguồn
 * backend thật (socket event) nên danh sách này gần như rỗng — chỉ còn một
 * mục `mention` mẫu, vì mention được suy ra từ nội dung tin nhắn chứ không
 * có event riêng.
 *
 * Bỏ lời gọi `buildDemoNotifications()` trong `NotificationService` là hết
 * sạch dữ liệu giả; UI và luồng realtime không phải sửa gì.
 */

/** Offset theo phút so với `Date.now()` để dữ liệu demo luôn trông "vừa xảy ra". */
function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export function buildDemoNotifications(): AppNotification[] {
  return [
    {
      id: 'n-1',
      type: 'mention',
      title: 'Nguyễn Văn A đã nhắc đến bạn',
      message: 'đã nhắc đến bạn trong công việc "Landing Page Calendar".',
      createdAt: minutesAgo(2),
      isRead: false,
      sender: { name: 'Nguyễn Văn A' },
      relatedId: 'task-landing-page',
    },
  ];
}
