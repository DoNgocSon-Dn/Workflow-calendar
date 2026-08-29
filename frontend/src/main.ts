import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { captureOauthRedirect } from './app/core/auth/oauth-redirect-flag';

interface AppSplash {
  set(pct: number, msg?: string): void;
  done(): void;
  fail(msg?: string): void;
}
const splash = (window as unknown as { __appSplash?: AppSplash }).__appSplash;

// Phải chạy trước bootstrap: Supabase xoá token khỏi URL ngay khi client được
// khởi tạo, nên đây là thời điểm cuối còn đọc được dấu vết OAuth callback.
captureOauthRedirect();

/** Gỡ màn hình chờ trong index.html khi Angular đã dựng xong. */
function removeAppSplash(): void {
  const el = document.getElementById('app-splash');
  if (!el) return;
  el.classList.add('app-splash--hide');
  setTimeout(() => el.remove(), 450);
}

splash?.set(78, 'Sắp xong…');

bootstrapApplication(App, appConfig)
  .then(() => {
    splash?.done();
    removeAppSplash();
  })
  .catch((err) => {
    console.error(err);
    // KHÔNG gỡ splash → tránh màn hình đen câm. Hiện thông báo lỗi + nút Tải lại.
    if (splash) splash.fail('Không tải được ứng dụng. Kiểm tra kết nối mạng rồi bấm Tải lại.');
    else removeAppSplash();
  });
