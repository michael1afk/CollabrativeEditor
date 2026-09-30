import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth/guard.js';
import { db } from '../db/index.js';
import { documentPermissions, documents } from '../db/schema.js';
import type { DocumentRole } from '../db/schema.js';

const uuidParam = z.object({ id: z.string().uuid() });
const createBody = z.object({ title: z.string().trim().min(1).max(200).optional() });
const patchBody = z.object({ title: z.string().trim().min(1).max(200) });

export interface DocumentSummary {
  id: string;
  title: string;
  ownerId: string;
  role: DocumentRole | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * NOTE ON AUTHORIZATION
 * ---------------------
 * These routes authenticate (401 for anonymous callers) but deliberately do
 * NOT authorize. GET/PATCH/DELETE of a single document currently succeed for
 * any signed-in user, regardless of whether they hold a role on it. Role checks
 * arrive next phase in server/src/permissions.ts and go through that module
 * rather than inline here (CLAUDE.md).
 *
 * The list endpoint is the exception only incidentally: it joins through
 * document_permissions because that is the only way to know which documents to
 * name, not because it is enforcing anything.
 */
export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/documents', async (request, reply) => {
    const claims = await requireUser(request, reply);
    if (!claims) {
      return reply;
    }

    const rows = await db
      .select({
        id: documents.id,
        title: documents.title,
        ownerId: documents.ownerId,
        role: documentPermissions.role,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .innerJoin(
        documentPermissions,
        and(
          eq(documentPermissions.documentId, documents.id),
          eq(documentPermissions.userId, claims.sub),
        ),
      )
      .orderBy(desc(documents.updatedAt));

    return reply.send({ documents: rows.map(serialize) });
  });

  app.post('/api/documents', async (request, reply) => {
    const claims = await requireUser(request, reply);
    if (!claims) {
      return reply;
    }

    const parsed = createBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_title' });
    }

    // The document row and its owner grant are written together: a document
    // with no owner permission would be invisible to its own creator.
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(documents)
        .values({
          title: parsed.data.title ?? 'Untitled document',
          ownerId: claims.sub,
        })
        .returning();

      if (!row) {
        throw new Error('document insert returned no row');
      }

      await tx.insert(documentPermissions).values({
        documentId: row.id,
        userId: claims.sub,
        role: 'owner',
      });

      return row;
    });

    return reply.code(201).send({
      document: serialize({ ...created, role: 'owner' }),
    });
  });

  app.get('/api/documents/:id', async (request, reply) => {
    const claims = await requireUser(request, reply);
    if (!claims) {
      return reply;
    }

    const parsed = uuidParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_id' });
    }

    const [row] = await db
      .select({
        id: documents.id,
        title: documents.title,
        ownerId: documents.ownerId,
        role: documentPermissions.role,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      // LEFT join: the row is returned even when this user holds no role, so
      // `role` reports what they have without gating access (see note above).
      .leftJoin(
        documentPermissions,
        and(
          eq(documentPermissions.documentId, documents.id),
          eq(documentPermissions.userId, claims.sub),
        ),
      )
      .where(eq(documents.id, parsed.data.id))
      .limit(1);

    if (!row) {
      return reply.code(404).send({ error: 'not_found' });
    }

    return reply.send({ document: serialize(row) });
  });

  app.patch('/api/documents/:id', async (request, reply) => {
    const claims = await requireUser(request, reply);
    if (!claims) {
      return reply;
    }

    const params = uuidParam.safeParse(request.params);
    const body = patchBody.safeParse(request.body);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_id' });
    }
    if (!body.success) {
      return reply.code(400).send({ error: 'invalid_title' });
    }

    const [row] = await db
      .update(documents)
      .set({ title: body.data.title, updatedAt: sql`now()` })
      .where(eq(documents.id, params.data.id))
      .returning();

    if (!row) {
      return reply.code(404).send({ error: 'not_found' });
    }

    return reply.send({ document: serialize({ ...row, role: null }) });
  });

  app.delete('/api/documents/:id', async (request, reply) => {
    const claims = await requireUser(request, reply);
    if (!claims) {
      return reply;
    }

    const parsed = uuidParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_id' });
    }

    // Permission rows and the snapshot go with it: both cascade on the FK.
    const [row] = await db
      .delete(documents)
      .where(eq(documents.id, parsed.data.id))
      .returning({ id: documents.id });

    if (!row) {
      return reply.code(404).send({ error: 'not_found' });
    }

    return reply.send({ ok: true, id: row.id });
  });
}

interface DocumentRow {
  id: string;
  title: string;
  ownerId: string;
  role: DocumentRole | null;
  createdAt: Date;
  updatedAt: Date;
}

function serialize(row: DocumentRow): DocumentSummary {
  return {
    id: row.id,
    title: row.title,
    ownerId: row.ownerId,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
