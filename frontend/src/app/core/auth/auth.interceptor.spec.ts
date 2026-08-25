import { HttpErrorResponse, HttpHandlerFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SUPABASE_CLIENT } from '../supabase-client';
import { AuthStore } from './auth-store';
import { authInterceptor } from './auth.interceptor';

/**
 * Bộ AuthStore giả — chỉ giữ đúng phần interceptor dùng tới, và đếm số lần
 * làm mới để bắt được lỗi gọi refresh nhiều lần song song.
 */
class FakeAuthStore {
  token: string | null = 'expired-token';
  refreshCalls = 0;
  refreshSucceeds = true;

  accessToken = () => this.token;

  refreshSession = async (): Promise<boolean> => {
    this.refreshCalls += 1;
    if (!this.refreshSucceeds) return false;
    this.token = 'fresh-token';
    return true;
  };
}

function setup(store: FakeAuthStore) {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthStore, useValue: store },
      { provide: SUPABASE_CLIENT, useValue: {} },
    ],
  });
}

/** Chạy interceptor trong injection context và trả về Observable kết quả. */
function run(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<unknown> {
  return TestBed.runInInjectionContext(() => authInterceptor(req, next) as Observable<unknown>);
}

const apiReq = () => new HttpRequest('GET', `${environment.apiUrl}/groups`);
const authHeaderOf = (r: HttpRequest<unknown>) => r.headers.get('Authorization');

describe('authInterceptor', () => {
  it('gắn access token vào request tới API của ứng dụng', async () => {
    const store = new FakeAuthStore();
    setup(store);

    const seen: string[] = [];
    const next: HttpHandlerFn = (r) => {
      seen.push(authHeaderOf(r) ?? '(khong co)');
      return of(new HttpResponse({ status: 200 }));
    };

    await firstValueFrom(run(apiReq(), next));
    expect(seen).toEqual(['Bearer expired-token']);
    expect(store.refreshCalls).toBe(0);
  });

  it('KHÔNG đụng vào request đi ra ngoài API của ứng dụng', async () => {
    const store = new FakeAuthStore();
    setup(store);

    const seen: (string | null)[] = [];
    const next: HttpHandlerFn = (r) => {
      seen.push(authHeaderOf(r));
      return of(new HttpResponse({ status: 200 }));
    };

    await firstValueFrom(run(new HttpRequest('GET', 'https://example.com/x'), next));
    expect(seen).toEqual([null]);
  });

  it('gặp 401 thì làm mới token rồi gửi lại đúng một lần', async () => {
    const store = new FakeAuthStore();
    setup(store);

    const seen: string[] = [];
    let call = 0;
    const next: HttpHandlerFn = (r) => {
      seen.push(authHeaderOf(r) ?? '(khong co)');
      call += 1;
      // Lần đầu token cũ -> 401. Lần sau token mới -> thành công.
      return call === 1
        ? throwError(() => new HttpErrorResponse({ status: 401 }))
        : of(new HttpResponse({ status: 200, body: { ok: true } }));
    };

    const res = await firstValueFrom(run(apiReq(), next));

    expect(store.refreshCalls).toBe(1);
    expect(seen).toEqual(['Bearer expired-token', 'Bearer fresh-token']);
    expect((res as HttpResponse<unknown>).body).toEqual({ ok: true });
  });

  it('làm mới thất bại thì trả lại lỗi 401 gốc, không gửi lại', async () => {
    const store = new FakeAuthStore();
    store.refreshSucceeds = false;
    setup(store);

    let calls = 0;
    const next: HttpHandlerFn = () => {
      calls += 1;
      return throwError(() => new HttpErrorResponse({ status: 401 }));
    };

    await expect(firstValueFrom(run(apiReq(), next))).rejects.toMatchObject({ status: 401 });
    expect(calls).toBe(1);
    expect(store.refreshCalls).toBe(1);
  });

  it('token mới vẫn 401 thì DỪNG, không lặp vô tận', async () => {
    const store = new FakeAuthStore();
    setup(store);

    let calls = 0;
    const next: HttpHandlerFn = () => {
      calls += 1;
      return throwError(() => new HttpErrorResponse({ status: 401 }));
    };

    await expect(firstValueFrom(run(apiReq(), next))).rejects.toMatchObject({ status: 401 });
    // Đúng hai lần: lần đầu + đúng một lần gửi lại.
    expect(calls).toBe(2);
    expect(store.refreshCalls).toBe(1);
  });

  it('403 KHÔNG kích hoạt làm mới — đó là lỗi phân quyền, không phải hết hạn', async () => {
    const store = new FakeAuthStore();
    setup(store);

    let calls = 0;
    const next: HttpHandlerFn = () => {
      calls += 1;
      return throwError(() => new HttpErrorResponse({ status: 403 }));
    };

    await expect(firstValueFrom(run(apiReq(), next))).rejects.toMatchObject({ status: 403 });
    expect(calls).toBe(1);
    expect(store.refreshCalls).toBe(0);
  });

  it('500 cũng không kích hoạt làm mới', async () => {
    const store = new FakeAuthStore();
    setup(store);

    let calls = 0;
    const next: HttpHandlerFn = () => {
      calls += 1;
      return throwError(() => new HttpErrorResponse({ status: 500 }));
    };

    await expect(firstValueFrom(run(apiReq(), next))).rejects.toMatchObject({ status: 500 });
    expect(calls).toBe(1);
    expect(store.refreshCalls).toBe(0);
  });
});
