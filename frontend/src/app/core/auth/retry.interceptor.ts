import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { defer, finalize, retry, throwError, timeout, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ServerStatusService } from '../services/server-status.service';
import { isApiRequest } from './api-url';

/** Mỗi lần thử tối đa 12s rồi coi như treo. */
const ATTEMPT_TIMEOUT_MS = 12_000;
/** Số lần thử lại. 6 × (12s + backoff) ≈ 70–90s — đủ cho Render Free ngủ dậy. */
const MAX_RETRIES = 6;

function isColdStartFailure(err: unknown, method: string): boolean {
  // A lost response does not prove the server did not commit a write.
  // Only retry read requests until the API supports idempotency keys.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
  if (!(err instanceof HttpErrorResponse)) return true;
  if ([0, 502, 503, 504].includes(err.status)) return true;
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
  if (!isApiRequest(req.url, environment.apiUrl)) return next(req);

  const status = inject(ServerStatusService);
  let counted = false;

  return defer(() => next(req)).pipe(
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
