import { Database } from '@hocuspocus/extension-database';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { documentSnapshots, documents } from '../db/schema.js';

/**
 * A document name on the wire is the document's UUID - the primary key of the
 * `documents` row. Anything else cannot be persisted, because
 * `document_snapshots.document_id` is a foreign key onto that table.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Persists Yjs state to Postgres, one row per document.
 *
 * WHY THE STATE IS STORED AS AN OPAQUE BINARY BLOB
 * ------------------------------------------------
 * `state` here is Y.encodeStateAsUpdate(doc) - the CRDT's own wire format -
 * and this layer treats it as bytes it is not allowed to interpret. It never
 * converts to HTML or markdown on the way in, and never parses on the way out.
 *
 * That is not laziness, it is what makes merging correct:
 *
 *  - The blob is more than the visible text. It carries each client's logical
 *    clock, the id of every inserted item, and tombstones for deleted ones.
 *    That bookkeeping is precisely what lets a client that has been offline
 *    reconnect and have its edits merge deterministically. Serialize to HTML
 *    and it is gone - all that is left is two strings and a guess.
 *  - Updates commute. A stored blob merged with a later update yields the same
 *    document regardless of arrival order, on every replica. Reconstructing
 *    that from structured rows would mean reimplementing the CRDT in SQL.
 *  - It decouples storage from the editor schema. Add a TipTap node next month
 *    and no stored row needs migrating; the encoding belongs to Yjs.
 *
 * The trade-off is real and worth stating: Postgres cannot see inside this
 * column. No LIKE, no full-text index, no reporting on content. When we need
 * searchable text we decode with Yjs on the server and write a derived column
 * alongside it - the blob stays the source of truth.
 */
export function createPersistence(): Database {
  return new Database({
    /**
     * Called once when a document is first loaded into memory. Returning null
     * means "no stored state" and Hocuspocus starts an empty document.
     */
    fetch: async ({ documentName }) => {
      if (!UUID_RE.test(documentName)) {
        console.warn(`[collab] ignoring non-UUID document name: ${documentName}`);
        return null;
      }

      const [row] = await db
        .select({ state: documentSnapshots.state })
        .from(documentSnapshots)
        .where(eq(documentSnapshots.documentId, documentName))
        .limit(1);

      // bytea comes back as a Buffer, which is already a Uint8Array view - no
      // decoding, no copy, straight back to Yjs.
      return row ? new Uint8Array(row.state) : null;
    },

    /**
     * Called on a debounce after changes settle, and again when the last client
     * disconnects. One row per document, overwritten in place: this is a
     * snapshot of the whole state, not an append-only update log.
     */
    store: async ({ documentName, state }) => {
      if (!UUID_RE.test(documentName)) {
        return;
      }

      const exists = await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.id, documentName))
        .limit(1);

      if (exists.length === 0) {
        // No documents row means the FK would reject the insert. Drop the write
        // rather than crash the store hook; creating documents is not this
        // layer's job.
        console.warn(`[collab] no document row for ${documentName}, snapshot not stored`);
        return;
      }

      await db.transaction(async (tx) => {
        await tx
          .insert(documentSnapshots)
          .values({ documentId: documentName, state })
          .onConflictDoUpdate({
            target: documentSnapshots.documentId,
            set: { state, updatedAt: sql`now()` },
          });

        await tx
          .update(documents)
          .set({ updatedAt: sql`now()` })
          .where(eq(documents.id, documentName));
      });
    },
  });
}
