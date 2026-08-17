import { Routes } from '@angular/router';
import { GoogleLoginProvider, SOCIAL_AUTH_CONFIG, SocialAuthServiceConfig } from '@abacritt/angularx-social-login';
import { authGuard } from './core/auth/auth.guard';
import { environment } from '../environments/environment';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'calendar' },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login-page/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/register-page/register-page').then((m) => m.RegisterPage),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password-page/forgot-password-page').then(
        (m) => m.ForgotPasswordPage,
      ),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password-page/reset-password-page').then(
        (m) => m.ResetPasswordPage,
      ),
  },
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
  { path: '**', redirectTo: 'calendar' },
];
