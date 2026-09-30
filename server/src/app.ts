import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { authRoutes } from './auth/routes.js';
import { documentRoutes } from './routes/documents.js';

export interface HealthResponse {
  ok: true;
}

/**
 * Builds the HTTP app. The realtime (WebSocket) server attaches to this same
 * Fastify instance's listener - one process, one HTTP listener.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
  });

  // Signed cookies are not used: the JWT carries its own signature, so a
  // tampered cookie fails verification rather than needing a second one.
  await app.register(cookie);

  // Both paths: /health for infrastructure probes, /api/health for the client,
  // which reaches the server only through the /api prefix.
  const health = async (): Promise<HealthResponse> => ({ ok: true });
  app.get('/health', health);
  app.get('/api/health', health);

  await app.register(authRoutes);
  await app.register(documentRoutes);

  return app;
}
