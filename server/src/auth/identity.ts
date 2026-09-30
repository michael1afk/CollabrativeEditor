import { randomInt, randomUUID } from 'node:crypto';

const ADJECTIVES = [
  'Quiet', 'Bright', 'Rapid', 'Clever', 'Bold', 'Gentle', 'Curious', 'Lucky',
] as const;

const ANIMALS = [
  'Otter', 'Falcon', 'Badger', 'Heron', 'Marten', 'Lynx', 'Magpie', 'Ibex',
] as const;

/** Legible as a caret label on a white page. */
const COLORS = [
  '#e8590c', '#1971c2', '#2f9e44', '#9c36b5', '#c2255c', '#0c8599', '#e03131',
] as const;

function pick<T>(items: readonly T[]): T {
  const item = items[randomInt(items.length)];
  if (item === undefined) {
    throw new Error('pick() called with an empty list');
  }
  return item;
}

export function generateDisplayName(): string {
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
}

export function generateColor(): string {
  return pick(COLORS);
}

/**
 * Guests still occupy a row in `users` (documents and permissions reference it
 * by foreign key), so they need a unique email. It is synthetic and
 * unroutable - nothing is ever sent to it.
 */
export function generateGuestEmail(): string {
  return `guest-${randomUUID()}@guest.invalid`;
}
