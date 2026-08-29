/* Service worker — chỉ lo Web Push cho nhắc lịch khi app đã đóng.
 * KHÔNG cache gì (không phải PWA offline). Giữ file này nhỏ và ổn định:
 * mỗi lần đổi nội dung, trình duyệt mới cài lại bản mới.
 */

self.addEventListener('install', (event) => {
  // Kích hoạt bản mới ngay, không chờ tab cũ đóng hết.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function buildBody(data) {
  if (data.body && data.body !== 'reminder') return data.body;
  if (data.startAt) {
    const d = new Date(data.startAt);
    if (!Number.isNaN(d.getTime())) {
      // Format theo múi giờ + ngôn ngữ của chính máy người nhận.
      const time = new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
      return `Sắp diễn ra: ${time}`;
    }
  }
  return 'Bạn có một lời nhắc lịch.';
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Nhắc lịch', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Nhắc lịch';
  const options = {
    body: buildBody(data),
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/calendar' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/calendar';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // Đã có tab app mở → focus và điều hướng, không mở tab mới.
        if ('focus' in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
