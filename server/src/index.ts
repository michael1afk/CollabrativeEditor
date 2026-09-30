import { buildApp } from './app.js';
import { COLLAB_PATH, collabServer, registerCollabWebSocket } from './collab/server.js';

const PORT = Number(process.env['PORT'] ?? 3001);
const HOST = process.env['HOST'] ?? '0.0.0.0';

const app = await buildApp();

// The API and the WebSocket server share this one process and one listener:
// Fastify owns the HTTP server, Hocuspocus claims upgrades on /collab.
registerCollabWebSocket(app.server);

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`collab websocket ready on ws://localhost:${PORT}${COLLAB_PATH}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void (async () => {
      collabServer.closeConnections();
      await app.close();
      process.exit(0);
    })();
  });
}
