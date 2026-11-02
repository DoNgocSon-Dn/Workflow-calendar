import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import type { Socket } from 'socket.io-client';
import { AuthStore } from '../auth/auth-store';
import { REALTIME_SOCKET_FACTORY, RealtimeService } from './realtime.service';

describe('realtime resume', () => {
  let token: ReturnType<typeof signal<string | null>>;
  let socket: { connected: boolean; on: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; removeAllListeners: ReturnType<typeof vi.fn>; emit: ReturnType<typeof vi.fn> };
  let handlers: Record<string, () => void>;
  let realtime: RealtimeService;
  beforeEach(() => {
    handlers = {};
    token = signal<string | null>('access-token');
    socket = { connected: false, on: vi.fn((name, cb) => { handlers[name] = cb; }), connect: vi.fn(), disconnect: vi.fn(), removeAllListeners: vi.fn(), emit: vi.fn() };
    TestBed.configureTestingModule({ providers: [
      { provide: AuthStore, useValue: { accessToken: token } },
      { provide: REALTIME_SOCKET_FACTORY, useValue: () => socket as unknown as Socket },
    ] });
    realtime = TestBed.inject(RealtimeService); TestBed.tick();
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.clearAllMocks(); });
  it('requests calendar/group snapshots when returning with a live transport', () => {
    const catchUp = vi.fn(); realtime.onReconnect(catchUp);
    socket.connected = true; handlers['connect']();
    expect(catchUp).not.toHaveBeenCalled();
    realtime.resume();
    expect(catchUp).toHaveBeenCalledOnce();
  });
  it('reconnects a sleeping transport and recovers only after connection', () => {
    const catchUp = vi.fn(); realtime.onReconnect(catchUp);
    socket.connected = true; handlers['connect']();
    socket.connected = false; handlers['disconnect']();
    realtime.resume();
    expect(socket.connect).toHaveBeenCalledOnce();
    expect(catchUp).not.toHaveBeenCalled();
    socket.connected = true; handlers['connect']();
    expect(catchUp).toHaveBeenCalledOnce();
  });
  it('clears the live indicator while replacing the authentication token', () => {
    socket.connected = true; handlers['connect']();
    expect(realtime.connected()).toBe(true);
    token.set('refreshed-token'); TestBed.tick();
    expect(realtime.connected()).toBe(false);
    expect(socket.disconnect).toHaveBeenCalled();
  });
});
