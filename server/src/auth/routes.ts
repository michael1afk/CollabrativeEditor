import { hash, verify as verifyHash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { requireUser } from './guard.js';
import {
  generateColor,
  generateDisplayName,
  generateGuestEmail,
} from './identity.js';
import {
  type SessionClaims,
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
  signCollabToken,
  signSessionToken,
} from './jwt.js';

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  // Long enough to matter, capped because argon2 hashing cost scales with input.
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(80).optional(),
});

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  color: string;
  isGuest: boolean;
}

/**
 * argon2 throws on a hash it cannot parse (a row written by an older scheme, or
 * corrupted). That is a failed login, not a server fault - returning 500 here
 * would both mislead the caller and leak that the account exists.
 */
async function safeVerify(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verifyHash(storedHash, password);
  } catch {
    return false;
  }
}

function toPublicUser(row: typeof users.$inferSelect): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    color: row.color,
    isGuest: row.isGuest,
  };
}

function toClaims(user: PublicUser): SessionClaims {
  return {
    sub: user.id,
    email: user.email,
    displayName: user.displayName,
    color: user.color,
    isGuest: user.isGuest,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/signup', async (request, reply) => {
    const parsed = credentials.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_credentials_format' });
    }
    const { email, password, displayName } = parsed.data;

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      return reply.code(409).send({ error: 'email_taken' });
    }

    const [row] = await db
      .insert(users)
      .values({
        email,
        passwordHash: await hash(password),
        displayName: displayName ?? email.split('@')[0] ?? 'New User',
        color: generateColor(),
        isGuest: false,
      })
      .returning();

    if (!row) {
      return reply.code(500).send({ error: 'signup_failed' });
    }

    const user = toPublicUser(row);
    setSessionCookie(reply, signSessionToken(toClaims(user)));
    return reply.code(201).send({ user });
  });

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = credentials.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_credentials_format' });
    }
    const { email, password } = parsed.data;

    const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    // Same response whether the row is missing, is a guest, or the password is
    // wrong: distinguishing them would let a caller enumerate accounts.
    const ok = row?.passwordHash != null && (await safeVerify(row.passwordHash, password));

    if (!row || !ok) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    const user = toPublicUser(row);
    setSessionCookie(reply, signSessionToken(toClaims(user)));
    return reply.send({ user });
  });

  /**
   * Creates a throwaway account so a visitor can try the editor immediately.
   * It is a real `users` row - documents and permissions reference users by
   * foreign key - but it has no password, so once the cookie is gone there is
   * no way back into it.
   */
  app.post('/api/auth/guest', async (_request, reply) => {
    const [row] = await db
      .insert(users)
      .values({
        email: generateGuestEmail(),
        passwordHash: null,
        displayName: generateDisplayName(),
        color: generateColor(),
        isGuest: true,
      })
      .returning();

    if (!row) {
      return reply.code(500).send({ error: 'guest_creation_failed' });
    }

    const user = toPublicUser(row);
    const token = signSessionToken(toClaims(user));
    setSessionCookie(reply, token);
    // The token is returned in the body as well: the caller asked for a JWT,
    // and the cookie itself is httpOnly and therefore unreadable by JS.
    return reply.code(201).send({ user, token });
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  app.get('/api/auth/me', async (request, reply) => {
    const claims = readSessionCookie(request);
    if (!claims) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    // Read through to the row rather than trusting the token: a display name
    // may have changed, or the account may have been deleted, since it was cut.
    const [row] = await db.select().from(users).where(eq(users.id, claims.sub)).limit(1);
    if (!row) {
      clearSessionCookie(reply);
      return reply.code(401).send({ error: 'unauthorized' });
    }

    return reply.send({ user: toPublicUser(row) });
  });

  /**
   * Mints a short-lived token for the Hocuspocus handshake.
   *
   * The session lives in an httpOnly cookie, which browser JS cannot read, so
   * it cannot be handed to the provider's `token` option directly. This
   * exchanges the cookie for a separate WS-audience token the client holds in
   * memory only. Next phase, onAuthenticate verifies it with verifyCollabToken.
   */
  app.get('/api/auth/collab-token', async (request, reply) => {
    const claims = await requireUser(request, reply);
    if (!claims) {
      return reply;
    }
    return reply.send({ token: signCollabToken(claims) });
  });
}
