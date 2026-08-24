import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { captureOauthRedirect } from './app/core/auth/oauth-redirect-flag';

// Phải chạy trước bootstrap: Supabase xoá token khỏi URL ngay khi client được
// khởi tạo, nên đây là thời điểm cuối còn đọc được dấu vết OAuth callback.
captureOauthRedirect();

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
