/**
 * A throwaway identity for this browser tab.
 *
 * It is generated once at module load, so it survives React Strict Mode's
 * double mount and any re-render, and it is deliberately not persisted - there
 * is no account system yet. Once auth lands this is replaced by the real user.
 */

export interface SessionUser {
  name: string;
  color: string;
}

const ADJECTIVES = [
  'Quiet', 'Bright', 'Rapid', 'Clever', 'Bold', 'Gentle', 'Curious', 'Lucky',
] as const;

const ANIMALS = [
  'Otter', 'Falcon', 'Badger', 'Heron', 'Marten', 'Lynx', 'Magpie', 'Ibex',
] as const;

// Picked to stay legible as a caret label on white in both light and dark UI.
const COLORS = [
  '#e8590c', '#1971c2', '#2f9e44', '#9c36b5', '#c2255c', '#0c8599', '#e03131',
] as const;

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) {
    throw new Error('pick() called with an empty list');
  }
  return item;
}

export const SESSION_USER: SessionUser = {
  name: `${pick(ADJECTIVES)} ${pick(ANIMALS)}`,
  color: pick(COLORS),
};

/** Initials shown in a presence avatar, e.g. "Quiet Otter" -> "QO". */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
