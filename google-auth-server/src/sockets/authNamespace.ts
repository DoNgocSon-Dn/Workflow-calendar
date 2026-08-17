import { Namespace, Socket } from 'socket.io';
import { UserModel } from '../models/user.model';
import { signAppJwt } from '../utils/jwt';
import {
  GoogleTokenExpiredError,
  GoogleTokenInvalidError,
  verifyGoogleIdToken,
} from '../utils/verifyGoogleToken';

interface AuthSocketData {
  userId: string;
}

interface AuthServerToClientEvents {
  'auth:success': (payload: {
    token: string;
    user: { id: string; email: string; name: string; picture?: string | null };
  }) => void;
  'auth:error': (payload: { code: string; message: string }) => void;
}

type AuthSocket = Socket<
  Record<string, unknown>,
  AuthServerToClientEvents,
  Record<string, unknown>,
  AuthSocketData
>;

// Runs before the connection is accepted: no idToken, expired token, or
// invalid token all reject the handshake, so the client never gets a socket.
// `namespace` is left with socket.io's default event typing so this composes
// with a plain `Server`; we narrow to `AuthSocket` inside each handler.
export function registerAuthNamespace(namespace: Namespace): void {
  namespace.use(async (rawSocket, next) => {
    const socket = rawSocket as unknown as AuthSocket;
    const idToken = socket.handshake.auth?.['idToken'] as string | undefined;
    if (!idToken) {
      next(new Error('MISSING_ID_TOKEN'));
      return;
    }

    try {
      const profile = await verifyGoogleIdToken(idToken);

      const user = await UserModel.findOneAndUpdate(
        { googleSub: profile.sub },
        { email: profile.email, name: profile.name, picture: profile.picture },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      socket.data.userId = user.id;
      next();
    } catch (err) {
      if (err instanceof GoogleTokenExpiredError) {
        next(new Error('EXPIRED_ID_TOKEN'));
      } else if (err instanceof GoogleTokenInvalidError) {
        next(new Error('INVALID_ID_TOKEN'));
      } else {
        next(new Error('AUTH_FAILED'));
      }
    }
  });

  namespace.on('connection', async (rawSocket) => {
    const socket = rawSocket as unknown as AuthSocket;
    const user = await UserModel.findById(socket.data.userId);
    if (!user) {
      socket.emit('auth:error', { code: 'AUTH_FAILED', message: 'User not found after auth' });
      socket.disconnect(true);
      return;
    }

    const token = signAppJwt({ sub: user.id, googleSub: user.googleSub, email: user.email });

    socket.emit('auth:success', {
      token,
      user: { id: user.id, email: user.email, name: user.name, picture: user.picture },
    });

    socket.on('disconnect', (reason) => {
      // e.g. 'transport close' / 'client namespace disconnect' when the
      // network drops or the client tears down the socket deliberately.
      void reason;
    });
  });
}
