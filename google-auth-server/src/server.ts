import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { env } from './config/env';
import { registerAppNamespace } from './sockets/appNamespace';
import { registerAuthNamespace } from './sockets/authNamespace';

async function bootstrap(): Promise<void> {
  await mongoose.connect(env.mongoUri);

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.get('/health', (_req, res) => res.json({ ok: true }));

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
  });

  // '/' handshake: client presents a Google idToken and gets back an app JWT.
  registerAuthNamespace(io.of('/'));
  // '/app' handshake: client presents the app JWT for subsequent socket events.
  registerAppNamespace(io.of('/app'));

  httpServer.listen(env.port, '0.0.0.0', () => {
    console.log(`google-auth-server listening on port ${env.port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start google-auth-server', err);
  process.exit(1);
});
