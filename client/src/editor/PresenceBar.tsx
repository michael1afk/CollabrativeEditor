import { useEffect, useState } from 'react';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { initialsOf } from './session';

/**
 * AWARENESS STATE vs DOCUMENT STATE
 * ---------------------------------
 * Two entirely separate channels travel over the same WebSocket:
 *
 * Document state (Y.Doc)
 *   - The content itself, as a CRDT. Updates are commutative and merge in any
 *     order, so every client converges on identical content.
 *   - Cumulative and durable: it is the thing you persist, and it is still
 *     there tomorrow after everyone has closed their laptop.
 *   - Lives in the Y.Doc; the Collaboration extension binds it to the editor.
 *
 * Awareness state (y-protocols/awareness)
 *   - Who is here right now, and where their cursor is. Name, color, selection.
 *   - Ephemeral and non-mergeable: each client owns exactly one entry keyed by
 *     its clientId, and writing a new value replaces that entry outright rather
 *     than merging into it.
 *   - Tied to the connection. When a client disconnects (or simply stops
 *     sending its periodic heartbeat) its entry is removed everywhere and the
 *     presence list shrinks. Nothing about it is ever written to the document,
 *     and it is never persisted - which is exactly why a stale provider left
 *     alive by a missing cleanup shows up here as a ghost user.
 *
 * This component reads only the awareness channel.
 */

interface PresenceBarProps {
  provider: HocuspocusProvider;
}

interface PresentUser {
  clientId: number;
  name: string;
  color: string;
  isSelf: boolean;
}

export function PresenceBar({ provider }: PresenceBarProps) {
  const users = useAwarenessUsers(provider);

  return (
    <div className="presence" aria-label="People in this document">
      {users.map((user) => (
        <span
          key={user.clientId}
          className={user.isSelf ? 'presence-avatar is-self' : 'presence-avatar'}
          style={{ backgroundColor: user.color }}
          title={user.isSelf ? `${user.name} (you)` : user.name}
        >
          {initialsOf(user.name)}
        </span>
      ))}
      <span className="presence-count">
        {users.length} {users.length === 1 ? 'person' : 'people'}
      </span>
    </div>
  );
}

function useAwarenessUsers(provider: HocuspocusProvider): PresentUser[] {
  const [users, setUsers] = useState<PresentUser[]>([]);

  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) {
      return;
    }

    const read = (): void => {
      const self = awareness.clientID;
      const present: PresentUser[] = [];

      // getStates() is a Map<clientId, state>; `state.user` is whatever the
      // CollaborationCaret extension published for that client. A client that
      // has connected but not yet published a user has no entry to show.
      for (const [clientId, state] of awareness.getStates()) {
        const user = (state as { user?: { name?: unknown; color?: unknown } }).user;
        if (typeof user?.name !== 'string' || typeof user.color !== 'string') {
          continue;
        }
        present.push({
          clientId,
          name: user.name,
          color: user.color,
          isSelf: clientId === self,
        });
      }

      present.sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || a.clientId - b.clientId);
      setUsers(present);
    };

    read();
    awareness.on('change', read);
    return () => awareness.off('change', read);
  }, [provider]);

  return users;
}
