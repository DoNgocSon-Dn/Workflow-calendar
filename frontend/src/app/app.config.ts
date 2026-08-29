import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { retryInterceptor } from './core/auth/retry.interceptor';
import { AuthStore } from './core/auth/auth-store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // retryInterceptor NGOÀI cùng: mỗi lần thử lại vẫn chạy lại authInterceptor
    // để gắn access token mới nhất.
    provideHttpClient(withInterceptors([retryInterceptor, authInterceptor])),
    provideAppInitializer(() => inject(AuthStore).init()),
  ],
};
