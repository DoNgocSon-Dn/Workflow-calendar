import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthStore } from './auth-store';

/**
 * Refresh token cũng đã chết thì mọi request đang bay song song đều rơi vào
 * nhánh "không cứu được" gần như cùng lúc — không có cờ này, mỗi request sẽ
 * tự gọi signOut()/navigate() một lần, dội liên tiếp dù cùng một nguyên nhân.
 * Sống ở module scope (không phải trong hàm interceptor) vì interceptor chạy
 * lại từ đầu cho mỗi request.
 */
let sessionExpiredHandled = false;

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
  const router = inject(Router);
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
          if (!ok) {
            // refresh token cũng đã chết (hết hạn/bị thu hồi) — không có cách
            // nào tự phục hồi nữa. Trước đây cứ để lỗi trôi qua từng request,
            // người dùng thấy MỌI thao tác âm thầm hỏng mà không hiểu vì sao
            // (phải tự mở DevTools mới lần ra). Đá thẳng về /login kèm lý do,
            // thay vì để họ đoán.
            if (!sessionExpiredHandled) {
              sessionExpiredHandled = true;
              void authStore.signOut().finally(() => {
                void router.navigate(['/login'], {
                  queryParams: { sessionExpired: '1' },
                });
              });
            }
            return throwError(() => err);
          }
          // Làm mới thành công nghĩa là phiên vẫn sống — mở lại cờ để một lần
          // hết hạn KHÁC (hiếm, nhưng có thể xảy ra nếu tab mở rất lâu) vẫn
          // được xử lý thay vì bị cờ cũ chặn im lặng.
          sessionExpiredHandled = false;
          // Gửi lại ĐÚNG MỘT lần: nếu token mới cũng bị từ chối thì vấn đề
          // không nằm ở hạn token, và thử tiếp sẽ thành vòng lặp vô tận.
          return next(withToken(authStore.accessToken()));
        }),
      );
    }),
  );
};
