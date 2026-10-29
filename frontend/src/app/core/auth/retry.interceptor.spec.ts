import { HttpErrorResponse, HttpHandlerFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError, TimeoutError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { ServerStatusService } from '../services/server-status.service';
import { retryInterceptor } from './retry.interceptor';

function run(method: string, handler: HttpHandlerFn) {
  TestBed.configureTestingModule({});
  return firstValueFrom(TestBed.runInInjectionContext(() => retryInterceptor(
    new HttpRequest(method, `${environment.apiUrl}/events`, null), handler,
  )));
}

afterEach(() => { vi.useRealTimers(); TestBed.resetTestingModule(); });

describe('safe connection retries', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const error of [new HttpErrorResponse({ status: 0 }), new TimeoutError(), new HttpErrorResponse({ status: 503 })]) {
      it(`does not replay ${method} after ${error.name}`, async () => {
        const handler = vi.fn(() => throwError(() => error));
        await expect(run(method, handler)).rejects.toBe(error);
        expect(handler).toHaveBeenCalledTimes(1);
      });
    }
  }
  it('reinvokes downstream interceptors for a read retry and clears waking state', async () => {
    vi.useFakeTimers();
    const handler = vi.fn<HttpHandlerFn>()
      .mockImplementationOnce(() => throwError(() => new HttpErrorResponse({ status: 503 })))
      .mockImplementation(() => of(new HttpResponse({ status: 200 })));
    const result = run('GET', handler);
    const status = TestBed.inject(ServerStatusService);
    expect(status.waking()).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    await result;
    expect(handler).toHaveBeenCalledTimes(2);
    expect(status.waking()).toBe(false);
  });
  it('does not retry permission errors', async () => {
    const error = new HttpErrorResponse({ status: 403 });
    const handler = vi.fn(() => throwError(() => error));
    await expect(run('GET', handler)).rejects.toBe(error);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
