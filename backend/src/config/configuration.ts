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
  };
};
