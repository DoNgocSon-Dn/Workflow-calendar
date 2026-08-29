export interface AppConfig {
  port: number;
  corsOrigin: string;
  apiBaseUrl: string;
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
  };
  ai: {
    geminiApiKey: string;
  };
  mail: {
    gmailUser: string;
    gmailAppPassword: string;
  };
  /** Web Push (VAPID). Thiếu public+private ⇒ đẩy push bị TẮT (chỉ còn email +
   *  popup realtime khi mở app). Sinh cặp khoá: `npx web-push generate-vapid-keys`. */
  push: {
    vapidPublicKey: string;
    vapidPrivateKey: string;
    /** `mailto:` bắt buộc theo chuẩn VAPID — nơi push service liên hệ khi có sự cố. */
    vapidSubject: string;
  };
  /** Token bảo vệ endpoint gửi thông báo hệ thống. Để trống = tắt endpoint. */
  systemNotificationToken: string;
}

export default (): AppConfig => {
  const port = Number(process.env.PORT ?? 3000);
  return {
    port,
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
    // Base URL công khai của chính backend — dùng để build link xác nhận
    // trong email mời (respond-via-email), không phải origin của frontend.
    apiBaseUrl: process.env.API_BASE_URL ?? `http://localhost:${port}`,
    supabase: {
      url: process.env.SUPABASE_URL ?? '',
      anonKey: process.env.SUPABASE_ANON_KEY ?? '',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    },
    ai: {
      geminiApiKey: process.env.GEMINI_API_KEY ?? '',
    },
    mail: {
      gmailUser: process.env.GMAIL_USER ?? '',
      gmailAppPassword: process.env.GMAIL_APP_PASSWORD ?? '',
    },
    push: {
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
      vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
      vapidSubject:
        process.env.VAPID_SUBJECT ??
        (process.env.GMAIL_USER ? `mailto:${process.env.GMAIL_USER}` : 'mailto:admin@example.com'),
    },
    systemNotificationToken: process.env.SYSTEM_NOTIFICATION_TOKEN ?? '',
  };
};
