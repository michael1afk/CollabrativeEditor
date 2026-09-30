import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';

/** Name of the httpOnly cookie carrying the session token. */
export const SESSION_COOKIE = 'collab_session';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * Tokens minted for the WebSocket handshake are separate and short-lived. The
 * session cookie is httpOnly, so browser JS cannot read it to hand to the
 * Hocuspocus provider; the client asks for one of these instead. Narrow
 * audience + short TTL means a leaked collab token is worth far less than a
 * leaked session.
 */
const COLLAB_TTL_SECONDS = 60 * 60; // 1 hour

const SESSION_AUDIENCE = 'collab:session';
const COLLAB_AUDIENCE = 'collab:ws';
const ISSUER = 'collab-editor';

function secret(): string {
  const value = process.env['JWT_SECRET'];
  if (!value || value.length < 32) {
    throw new Error(
      'JWT_SECRET must be set to at least 32 characters. See server/.env.example.',
    );
  }
  return value;
}

export interface SessionClaims {
  /** User id (uuid). */
  sub: string;
  email: string;
  displayName: string;
  color: string;
  isGuest: boolean;
}

type Audience = typeof SESSION_AUDIENCE | typeof COLLAB_AUDIENCE;

function sign(claims: SessionClaims, audience: Audience, expiresIn: number): string {
  const { sub, ...rest } = claims;
  return jwt.sign(rest, secret(), {
    subject: sub,
    audience,
    issuer: ISSUER,
    expiresIn,
    algorithm: 'HS256',
  });
}

export function signSessionToken(claims: SessionClaims): string {
  return sign(claims, SESSION_AUDIENCE, SESSION_TTL_SECONDS);
}

export function signCollabToken(claims: SessionClaims): string {
  return sign(claims, COLLAB_AUDIENCE, COLLAB_TTL_SECONDS);
}

function verify(token: string, audience: Audience): SessionClaims | null {
  try {
    const payload = jwt.verify(token, secret(), {
      audience,
      issuer: ISSUER,
      algorithms: ['HS256'],
    });

    if (typeof payload === 'string') {
      return null;
    }
    return toClaims(payload);
  } catch {
    // Expired, wrong audience, bad signature - all are simply "not logged in".
    return null;
  }
}

export function verifySessionToken(token: string): SessionClaims | null {
  return verify(token, SESSION_AUDIENCE);
}

/** Used next phase, inside the Hocuspocus `onAuthenticate` hook. */
export function verifyCollabToken(token: string): SessionClaims | null {
  return verify(token, COLLAB_AUDIENCE);
}

function toClaims(payload: JwtPayload): SessionClaims | null {
  const { sub, email, displayName, color, isGuest } = payload;
  if (
    typeof sub !== 'string' ||
    typeof email !== 'string' ||
    typeof displayName !== 'string' ||
    typeof color !== 'string' ||
    typeof isGuest !== 'boolean'
  ) {
    return null;
  }
  return { sub, email, displayName, color, isGuest };
}

/**
 * Writes the session cookie.
 *
 * httpOnly keeps it away from JS (so XSS cannot exfiltrate the session),
 * sameSite=lax survives normal navigation while blocking cross-site POSTs, and
 * secure is on whenever we are not on a local dev origin.
 */
export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Reads and verifies the session cookie. Returns null when absent or invalid. */
export function readSessionCookie(request: FastifyRequest): SessionClaims | null {
  const token = request.cookies[SESSION_COOKIE];
  return token ? verifySessionToken(token) : null;
}
