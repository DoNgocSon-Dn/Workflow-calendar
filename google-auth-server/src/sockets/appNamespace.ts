import { Namespace, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { verifyAppJwt } from '../utils/jwt';

interface AppSocketData {
  sub: string;
  email: string;
}

type AppSocket = Socket<
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  AppSocketData
>;

// Example of a second namespace protected by the app's own JWT (not the
// Google idToken), demonstrating how it's reused for later socket events.
export function registerAppNamespace(namespace: Namespace): void {
  namespace.use((rawSocket, next) => {
    const socket = rawSocket as unknown as AppSocket;
    const token = socket.handshake.auth?.['token'] as string | undefined;
    if (!token) {
      next(new Error('MISSING_APP_TOKEN'));
      return;
    }

    try {
      const payload = verifyAppJwt(token);
      socket.data.sub = payload.sub;
      socket.data.email = payload.email;
      next();
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        next(new Error('EXPIRED_APP_TOKEN'));
      } else {
        next(new Error('INVALID_APP_TOKEN'));
      }
    }
  });

  namespace.on('connection', (rawSocket) => {
    const socket = rawSocket as unknown as AppSocket;
    socket.on('whoami', (_payload: unknown, callback: (res: { sub: string; email: string }) => void) => {
      callback({ sub: socket.data.sub, email: socket.data.email });
    });
  });
}
