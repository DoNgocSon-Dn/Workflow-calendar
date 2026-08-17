import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';

const client = new OAuth2Client(env.googleClientId);

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export class GoogleTokenExpiredError extends Error {}
export class GoogleTokenInvalidError extends Error {}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: env.googleClientId });
    payload = ticket.getPayload();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/token used too late|expired/i.test(message)) {
      throw new GoogleTokenExpiredError(message);
    }
    throw new GoogleTokenInvalidError(message);
  }

  if (!payload || !payload.sub || !payload.email || !payload.name) {
    throw new GoogleTokenInvalidError('Google token payload is missing required fields');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
}
