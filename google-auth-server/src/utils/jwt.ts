import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AppJwtPayload {
  sub: string;
  googleSub: string;
  email: string;
}

export function signAppJwt(payload: AppJwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

export function verifyAppJwt(token: string): AppJwtPayload {
  return jwt.verify(token, env.jwtSecret) as AppJwtPayload;
}
