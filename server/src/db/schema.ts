import { relations } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Postgres `bytea`. Drizzle has no first-class bytea column yet, so this maps
 * it to a Node Buffer in both directions.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const documentRole = pgEnum('document_role', ['owner', 'editor', 'viewer']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  /**
   * Null for guest accounts, which have no credentials and cannot log in again
   * once their cookie is gone. Every other account must have a hash, so this
   * column is checked wherever a password login is attempted.
   */
  passwordHash: text('password_hash'),
  displayName: text('display_name').notNull(),
  /** Presence color, reused for this user's caret in every document. */
  color: text('color').notNull(),
  /**
   * Guests are real rows so documents and permissions can reference them by
   * foreign key, but they are throwaway: no password, no way back in.
   */
  isGuest: boolean('is_guest').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('documents_owner_id_idx').on(table.ownerId)],
);

/**
 * The grant table. Every permission check reads from here - and only ever
 * through server/src/permissions.ts, never inline at a call site (CLAUDE.md).
 */
export const documentPermissions = pgTable(
  'document_permissions',
  {
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: documentRole('role').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.documentId, table.userId] }),
    index('document_permissions_user_id_idx').on(table.userId),
  ],
);

/**
 * The persisted Yjs state for a document - one row per document.
 *
 * WHY THIS IS AN OPAQUE BLOB
 * --------------------------
 * `state` is the output of Y.encodeStateAsUpdate(): the CRDT's own binary
 * encoding. We deliberately do NOT store the content as HTML, markdown, or
 * parsed JSON nodes, and nothing but Yjs is allowed to interpret these bytes.
 *
 *  1. It is not just the text. The blob carries the causal metadata the CRDT
 *     needs - per-client logical clocks, item ids, and the tombstones left by
 *     deletions. Rendering to HTML throws all of that away, so a client that
 *     reconnected with offline edits could no longer merge cleanly; you would
 *     be diffing text and guessing, which is exactly the conflict resolution
 *     Yjs exists to avoid.
 *  2. Merging stays correct and order-independent. Yjs updates commute, so a
 *     stored blob and a late update combine to the same result no matter which
 *     order they arrive in. Structured rows would need us to reimplement that.
 *  3. The editor schema can change without a data migration. The blob is
 *     defined by Yjs, not by whatever TipTap nodes we happen to support today.
 *
 * The cost is that Postgres cannot read into it: no full-text search, no
 * SQL-side queries on content. Anything that needs readable text belongs in a
 * separate derived column or table, written from the server after decoding the
 * blob with Yjs - never by making this column the source of truth for text.
 */
export const documentSnapshots = pgTable('document_snapshots', {
  documentId: uuid('document_id')
    .primaryKey()
    .references(() => documents.id, { onDelete: 'cascade' }),
  state: bytea('state').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  ownedDocuments: many(documents),
  permissions: many(documentPermissions),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  owner: one(users, { fields: [documents.ownerId], references: [users.id] }),
  permissions: many(documentPermissions),
  snapshot: one(documentSnapshots, {
    fields: [documents.id],
    references: [documentSnapshots.documentId],
  }),
}));

export const documentPermissionsRelations = relations(documentPermissions, ({ one }) => ({
  document: one(documents, {
    fields: [documentPermissions.documentId],
    references: [documents.id],
  }),
  user: one(users, { fields: [documentPermissions.userId], references: [users.id] }),
}));

export const documentSnapshotsRelations = relations(documentSnapshots, ({ one }) => ({
  document: one(documents, {
    fields: [documentSnapshots.documentId],
    references: [documents.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentPermission = typeof documentPermissions.$inferSelect;
export type DocumentSnapshot = typeof documentSnapshots.$inferSelect;
export type DocumentRole = (typeof documentRole.enumValues)[number];
