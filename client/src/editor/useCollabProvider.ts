import { useEffect, useState } from 'react';
import { HocuspocusProvider, WebSocketStatus } from '@hocuspocus/provider';
import * as Y from 'yjs';

/**
 * Where the collaboration socket lives. The Vite dev server also proxies
 * /collab to the same place (see vite.config.ts), so switching this to a
 * relative URL later is a one-line change.
 */
export const COLLAB_URL = 'ws://localhost:3001/collab';

export interface CollabSession {
  /**
   * The shared document state - the CRDT holding the actual content. Every
   * edit anyone makes becomes a Yjs update that merges into this doc in any
   * order and converges to the same result on every client. It is durable:
   * it is what would get persisted, and it outlives any single connection.
   */
  doc: Y.Doc | null;
  /**
   * The transport. Its `awareness` field carries a second, completely separate
   * channel - see PresenceBar.tsx for what that holds.
   */
  provider: HocuspocusProvider | null;
  status: WebSocketStatus;
}

/**
 * Opens one Y.Doc + HocuspocusProvider pair for `documentName`.
 *
 * Both are created inside the effect and torn down in its cleanup. This is not
 * optional: React Strict Mode mounts every effect twice in development, so
 * without the cleanup the first provider keeps its socket and its awareness
 * entry alive alongside the second. The visible symptom is duplicated
 * characters as you type (both providers echo the same local update back into
 * the same doc) plus a phantom extra user in the presence list.
 *
 * Order matters in the cleanup: destroy the provider first so it can clear its
 * awareness state and detach its update handlers while the doc is still valid,
 * then destroy the doc.
 */
export function useCollabProvider(
  documentName: string,
  token?: string,
): CollabSession {
  const [session, setSession] = useState<Omit<CollabSession, 'status'>>({
    doc: null,
    provider: null,
  });
  const [status, setStatus] = useState<WebSocketStatus>(WebSocketStatus.Connecting);

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: COLLAB_URL,
      name: documentName,
      document: doc,
      // Sent in the Hocuspocus handshake. Nothing verifies it yet; next phase
      // onAuthenticate checks it with verifyCollabToken and resolves the role.
      ...(token === undefined ? {} : { token }),
      onStatus: ({ status: next }) => setStatus(next),
    });

    setSession({ doc, provider });
    setStatus(WebSocketStatus.Connecting);

    return () => {
      provider.destroy();
      doc.destroy();
      setSession({ doc: null, provider: null });
    };
    // A new token means a new handshake, so the pair is rebuilt.
  }, [documentName, token]);

  return { ...session, status };
}
