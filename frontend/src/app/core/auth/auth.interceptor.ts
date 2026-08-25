import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthStore } from './auth-store';

/**
 * Gắn access token vào mọi request tới API của chính ứng dụng, và TỰ LÀM MỚI
 * khi token đã hết hạn.
 *
 * Không có nhánh làm mới, phiên hết hạn khiến mọi thao tác thất bại với
 * "Invalid or expired token" và người dùng kẹt cứng cho tới khi tự tải lại
 * trang — access token của Supabase chỉ sống một giờ, nên chỉ cần mở tab qua
 * bữa trưa là gặp.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const authStore = inject(AuthStore);
  const withToken = (token: string | null) =>
    token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(withToken(authStore.accessToken())).pipe(
    catchError((err: unknown) => {
      // Chỉ 401 mới đáng thử lại. 403 nghĩa là token hợp lệ nhưng không đủ
      // quyền — làm mới cũng không đổi được gì, và gửi lại chỉ tổ giấu mất
      // thông báo lỗi phân quyền thật.
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) {
        return throwError(() => err);
      }

      return from(authStore.refreshSession()).pipe(
        switchMap((ok) => {
          if (!ok) return throwError(() => err);
          // Gửi lại ĐÚNG MỘT lần: nếu token mới cũng bị từ chối thì vấn đề
          // không nằm ở hạn token, và thử tiếp sẽ thành vòng lặp vô tận.
          return next(withToken(authStore.accessToken()));
        }),
      );
    }),
  );
};
