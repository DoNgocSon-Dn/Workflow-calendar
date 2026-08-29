import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { captureOauthRedirect } from './app/core/auth/oauth-redirect-flag';

// Phải chạy trước bootstrap: Supabase xoá token khỏi URL ngay khi client được
// khởi tạo, nên đây là thời điểm cuối còn đọc được dấu vết OAuth callback.
captureOauthRedirect();

/** Gỡ màn hình chờ trong index.html khi Angular đã dựng xong (hoặc lỗi hẳn). */
function removeAppSplash(): void {
  const el = document.getElementById('app-splash');
  if (!el) return;
  el.classList.add('app-splash--hide');
  setTimeout(() => el.remove(), 450);
}

bootstrapApplication(App, appConfig)
  .then(removeAppSplash)
  .catch((err) => {
    console.error(err);
    removeAppSplash();
  });
