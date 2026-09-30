import type { Server as HttpServer } from 'node:http';
import { Hocuspocus, type WebSocketLike } from '@hocuspocus/server';
import crossws from 'crossws/adapters/node';
import type { Peer } from 'crossws';
import { createPersistence } from './persistence.js';

/** WebSocket upgrades on this path are handed to Hocuspocus. */
export const COLLAB_PATH = '/collab';

/**
 * The collaboration server.
 *
 * It holds one Y.Doc per document name in memory and relays updates between
 * every client connected to that name. Two kinds of data flow over the socket
 * and they are NOT the same thing:
 *
 *  - Document state: the Yjs CRDT itself - the actual content. It is merged,
 *    persisted (later), and survives every client disconnecting.
 *  - Awareness state: ephemeral per-connection presence (who is here, cursor
 *    position, name, color). It lives only as long as the connection and is
 *    dropped the moment a client goes away. It is never part of the document.
 *
 * Document state is persisted to Postgres by the Database extension (see
 * persistence.ts); awareness deliberately is not, because it describes live
 * connections and means nothing once they are gone.
 *
 * Still no auth: that arrives as an `onAuthenticate` hook delegating to
 * server/src/permissions.ts - never inline here.
 */
export const collabServer = new Hocuspocus({
  name: 'collab',
  quiet: true,
  extensions: [createPersistence()],
});

type CollabConnection = ReturnType<Hocuspocus['handleConnection']>;

/**
 * Hocuspocus needs one connection object per peer to route messages to. crossws
 * peers are not keyed by us, so a WeakMap keeps the association without leaking
 * when the peer is collected.
 */
const connections = new WeakMap<Peer, CollabConnection>();

/**
 * Attaches Hocuspocus to an existing Node HTTP server, so the REST API and the
 * WebSocket server share one process and one listener (see CLAUDE.md). Only
 * upgrades for COLLAB_PATH are claimed; anything else is left alone so other
 * upgrade handlers (or Fastify's own) still see it.
 */
export function registerCollabWebSocket(httpServer: HttpServer): void {
  const ws = crossws({
    hooks: {
      open: (peer) => {
        // peer.websocket is typed as Partial<WebSocket> by crossws, but always
        // carries send/close/readyState - exactly the WebSocketLike shape
        // Hocuspocus asks for. This is the same handoff Hocuspocus' own bundled
        // Server does internally.
        const socket = peer.websocket as WebSocketLike;
        connections.set(peer, collabServer.handleConnection(socket, peer.request));
      },
      message: (peer, message) => {
        connections.get(peer)?.handleMessage(message.uint8Array());
      },
      close: (peer, event) => {
        // crossws leaves both optional; 1000 is a normal closure.
        connections.get(peer)?.handleClose({
          code: event.code ?? 1000,
          reason: event.reason ?? '',
        });
        connections.delete(peer);
      },
      error: (peer, error) => {
        console.error(`[collab] socket error on peer ${peer.id}:`, error);
      },
    },
  });

  httpServer.on('upgrade', (request, socket, head) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;

    // Document name is the rest of the path (/collab/my-doc), which the client
    // also sends in the handshake; Hocuspocus reads it from the handshake.
    if (path !== COLLAB_PATH && !path.startsWith(`${COLLAB_PATH}/`)) {
      return;
    }

    void ws.handleUpgrade(request, socket, head);
  });
}
