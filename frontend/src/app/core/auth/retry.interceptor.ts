import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize, retry, throwError, timeout, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ServerStatusService } from '../services/server-status.service';

/** Mỗi lần thử tối đa 12s rồi coi như treo. */
const ATTEMPT_TIMEOUT_MS = 12_000;
/** Số lần thử lại. 6 × (12s + backoff) ≈ 70–90s — đủ cho Render Free ngủ dậy. */
const MAX_RETRIES = 6;

function isColdStartFailure(err: unknown, method: string): boolean {
  // status 0 = request KHÔNG tới được server (mất mạng, CORS, timeout, server
  // đang dậy) → thử lại an toàn với mọi method vì server chưa xử lý gì.
  if (!(err instanceof HttpErrorResponse)) return true; // TimeoutError, v.v.
  if (err.status === 0) return true;
  // 502/503/504 = qua được tới hạ tầng nhưng backend chưa sẵn sàng. Chỉ thử lại
  // GET để không lỡ gửi trùng một thao tác ghi.
  if ([502, 503, 504].includes(err.status)) return method === 'GET';
  return false;
}

/**
 * Tự thử lại request khi backend không phản hồi (thường vì đang "ngủ dậy"),
 * và bật cờ `ServerStatusService.waking` để app hiện dải "Đang kết nối...".
 *
 * Đặt NGOÀI authInterceptor (xem app.config) để mỗi lần thử lại vẫn gắn lại
 * access token mới nhất.
 */
export const retryInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) return next(req);

  const status = inject(ServerStatusService);
  let counted = false;

  return next(req).pipe(
    timeout(ATTEMPT_TIMEOUT_MS),
    retry({
      count: MAX_RETRIES,
      delay: (err, retryCount) => {
        if (!isColdStartFailure(err, req.method)) return throwError(() => err);
        if (!counted) {
          counted = true;
          status.beginRetry();
        }
        // backoff nhẹ: 2s, 4s, 6s … tối đa 8s
        return timer(Math.min(retryCount * 2000, 8000));
      },
    }),
    finalize(() => {
      if (counted) status.endRetry();
    }),
  );
};
