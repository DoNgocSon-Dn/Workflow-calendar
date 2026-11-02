import { createServer, Server as HttpServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io, Socket } from 'socket.io-client';
import { RealtimeGateway } from './realtime.gateway';
import { SupabaseService } from '../supabase/supabase.service';

/** Real Socket.IO transport and room routing; authentication is isolated from live accounts. */
describe('private realtime transport', () => {
  let http: HttpServer;
  let server: Server;
  let gateway: RealtimeGateway;
  let url: string;
  let clients: Socket[];
  let getUser: jest.Mock;

  const event = <T = unknown>(socket: Socket, name: string): Promise<T> =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Missing ${name}`)), 3000);
      socket.once(name, (payload: T) => { clearTimeout(timeout); resolve(payload); });
    });
  const connect = (token: string) => {
    const client = io(url, { auth: { token }, autoConnect: false, reconnection: false, transports: ['websocket'] });
    clients.push(client);
    return client;
  };
  beforeEach(async () => {
    clients = [];
    getUser = jest.fn(async (token: string) => ({ data: { user: { id: token } }, error: null }));
    gateway = new RealtimeGateway({
      getAnonClient: () => ({ auth: { getUser } }),
      getClientForToken: () => ({}),
    } as unknown as SupabaseService);
    http = createServer();
    server = new Server(http);
    gateway.server = server;
    server.on('connection', socket => gateway.handleConnection(socket as Parameters<RealtimeGateway['handleConnection']>[0]));
    await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    clients.forEach(client => client.disconnect());
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  it('delivers direct messages, receipts and friend updates only to the intended users', async () => {
    const a = connect('a'), b = connect('b'), stranger = connect('stranger');
    const ready = [a, b, stranger].map(client => event(client, 'session:ready'));
    [a, b, stranger].forEach(client => client.connect());
    await Promise.all(ready);
    const privateOnStranger = jest.fn();
    stranger.onAny(privateOnStranger);
    const msg = { id: 'message-1', senderId: 'a', recipientId: 'b', body: 'test' };
    const received = event(b, 'direct:message');
    gateway.emitToUser('b', 'direct:message', msg);
    await expect(received).resolves.toEqual(msg);
    const read = event(a, 'direct:read');
    gateway.emitToUser('a', 'direct:read', { readerId: 'b', messageIds: ['message-1'] });
    await expect(read).resolves.toEqual({ readerId: 'b', messageIds: ['message-1'] });
    const changed = event(b, 'social:changed');
    gateway.emitToUser('b', 'social:changed', { kind: 'friend-request' });
    await expect(changed).resolves.toEqual({ kind: 'friend-request' });
    // A same-connection barrier proves all preceding packets have been processed.
    const barrier = event(stranger, 'test:barrier');
    gateway.emitToUser('stranger', 'test:barrier', {});
    await barrier;
    expect(privateOnStranger.mock.calls.map(call => call[0])).toEqual(['test:barrier']);
  });
  it('announces readiness only after authentication and private room membership', async () => {
    let finishAuth!: (result: unknown) => void;
    getUser.mockImplementation(() => new Promise(resolve => { finishAuth = resolve; }));
    const client = connect('a');
    const ready = jest.fn(); client.on('session:ready', ready);
    const connected = event(client, 'connect'); client.connect(); await connected;
    expect(ready).not.toHaveBeenCalled();
    const authenticated = event(client, 'session:ready');
    finishAuth({ data: { user: { id: 'a' } }, error: null });
    await authenticated;
    const received = event(client, 'direct:message');
    gateway.emitToUser('a', 'direct:message', { id: 'after-ready' });
    await expect(received).resolves.toEqual({ id: 'after-ready' });
  });
  it('disconnects a socket when the authentication service fails', async () => {
    getUser.mockRejectedValue(new Error('auth unavailable'));
    const client = connect('a');
    const ready = jest.fn(); client.on('session:ready', ready);
    const disconnected = event(client, 'disconnect'); client.connect();
    await disconnected;
    expect(client.connected).toBe(false);
    expect(ready).not.toHaveBeenCalled();
  });
  it('restores private user-room delivery after a client reconnects', async () => {
    const client = connect('a');
    let ready = event(client, 'session:ready'); client.connect(); await ready;
    client.disconnect();
    ready = event(client, 'session:ready'); client.connect(); await ready;
    const received = event(client, 'social:changed');
    gateway.emitToUser('a', 'social:changed', { kind: 'accepted' });
    await expect(received).resolves.toEqual({ kind: 'accepted' });
  });
});
