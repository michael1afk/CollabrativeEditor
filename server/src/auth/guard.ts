import type { FastifyReply, FastifyRequest } from 'fastify';
import { type SessionClaims, readSessionCookie } from './jwt.js';

/**
 * Authentication, not authorization.
 *
 * This answers "who is this request from?" and rejects anonymous callers with
 * 401. It says nothing about whether that user may touch the document they
 * asked for - role checks land next phase in server/src/permissions.ts, and
 * belong there rather than inline at any call site (CLAUDE.md).
 */
export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<SessionClaims | null> {
  const claims = readSessionCookie(request);
  if (!claims) {
    await reply.code(401).send({ error: 'unauthorized' });
    return null;
  }
  return claims;
}
