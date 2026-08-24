import { Routes } from '@angular/router';
import { GoogleLoginProvider, SOCIAL_AUTH_CONFIG, SocialAuthServiceConfig } from '@abacritt/angularx-social-login';
import { authGuard } from './core/auth/auth.guard';
import { environment } from '../environments/environment';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'landing' },
  {
    path: 'landing',
    loadComponent: () =>
      import('./features/landing/landing-page/landing-page').then((m) => m.LandingPage),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login-page/login-page').then((m) => m.LoginPage),
  },
  // Đăng ký / quên mật khẩu / đặt lại mật khẩu đã bỏ: /login chỉ còn đăng nhập
  // bằng Google, tài khoản mới được tạo ngay trong luồng đó và không có mật
  // khẩu để quên. Giữ redirect cho các link cũ (bookmark, email đã gửi đi).
  { path: 'register', redirectTo: 'login' },
  { path: 'forgot-password', redirectTo: 'login' },
  { path: 'reset-password', redirectTo: 'login' },
  {
    path: 'login-google-socket',
    loadComponent: () =>
      import('./features/auth/google-socket-login/google-socket-login').then(
        (m) => m.GoogleSocketLogin,
      ),
    providers: [
      {
        provide: SOCIAL_AUTH_CONFIG,
        useValue: {
          autoLogin: false,
          providers: [
            {
              id: GoogleLoginProvider.PROVIDER_ID,
              provider: new GoogleLoginProvider(environment.googleClientId),
            },
          ],
        } satisfies SocialAuthServiceConfig,
      },
    ],
  },
  {
    path: 'calendar',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/calendar/calendar-page/calendar-page').then((m) => m.CalendarPage),
  },
  {
    path: 'tasks',
    canActivate: [authGuard],
    loadComponent: () => import('./features/tasks/tasks-page/tasks-page').then((m) => m.TasksPage),
  },
  { path: '**', redirectTo: 'calendar' },
];
