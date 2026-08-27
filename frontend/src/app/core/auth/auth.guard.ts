import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth-store';

export const authGuard: CanActivateFn = async (_route, state) => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  await authStore.init();

  if (authStore.user()) {
    return true;
  }
  // Giữ lại URL đang định vào để đăng nhập xong quay lại đúng chỗ (vd. trang
  // "xin vào nhóm" từ link mời) — không có returnUrl thì OAuth luôn đưa về
  // /calendar mặc định, xem auth-store.signInWithGoogle().
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
