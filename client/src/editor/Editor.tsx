import { Link } from 'react-router-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { WebSocketStatus } from '@hocuspocus/provider';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type * as Y from 'yjs';
import { Toolbar } from './Toolbar';
import { PresenceBar } from './PresenceBar';
import { useCollabProvider } from './useCollabProvider';
import { SESSION_USER } from './session';
import { useAuth } from '../lib/auth';
import './editor.css';

interface EditorProps {
  /**
   * The document's UUID. `document_snapshots` has a foreign key onto
   * `documents.id`, so this is the id of a real row, not a free-form name.
   */
  documentName: string;
  title: string;
  /** Short-lived WS token; see server/src/auth/jwt.ts. */
  token?: string;
}

/**
 * Waits for the Y.Doc before mounting the editor.
 *
 * useCollabProvider creates the doc inside an effect, so it is null on the
 * first render. The editor must not be constructed during that render: an
 * editor with no extensions has no schema and Tiptap throws
 * "Schema is missing its top node type ('doc')", which unmounts the whole
 * tree. Gating here - above the hook - means useEditor only ever runs with a
 * real doc, and the surface below can assume both are present.
 */
export function Editor({ documentName, title, token }: EditorProps) {
  const { doc, provider, status } = useCollabProvider(documentName, token);

  if (!doc || !provider) {
    return <div className="editor-loading">Connecting…</div>;
  }

  return (
    <EditorSurface doc={doc} provider={provider} status={status} title={title} />
  );
}

interface EditorSurfaceProps {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  status: WebSocketStatus;
  title: string;
}

function EditorSurface({ doc, provider, status, title }: EditorSurfaceProps) {
  const { user } = useAuth();
  // Now that there are real accounts, the caret label is the signed-in user.
  // SESSION_USER is only the fallback for a not-yet-loaded session.
  const caretUser = user
    ? { name: user.displayName, color: user.color }
    : SESSION_USER;

  const editor = useEditor(
    {
      // The editor is rebuilt whenever the Y.Doc is replaced, so it never holds
      // a binding to a destroyed doc after a Strict Mode remount.
      extensions: [
        StarterKit.configure({
          // Undo/redo is disabled here on purpose: Yjs supplies its own
          // history, and running both corrupts the undo stack.
          undoRedo: false,
          heading: { levels: [1, 2, 3] },
        }),
        // Binds the editor to the shared document state (the CRDT).
        Collaboration.configure({ document: doc }),
        // Publishes this client's identity and selection onto the awareness
        // channel, and renders everyone else's carets. Nothing it writes
        // ever becomes part of the document.
        CollaborationCaret.configure({ provider, user: caretUser }),
      ],
      // Content is never seeded here: with Yjs the document comes from the
      // server, and injecting initial content would duplicate it once per
      // client that joins.
      editorProps: {
        attributes: {
          class: 'editor-surface',
          spellcheck: 'true',
        },
      },
    },
    [doc, provider, caretUser.name, caretUser.color],
  );

  if (!editor) {
    return <div className="editor-loading">Connecting…</div>;
  }

  return (
    <div className="editor">
      <div className="editor-header">
        <Link to="/" className="editor-back" title="Back to your documents">
          &larr;
        </Link>
        <span className="editor-title">{title}</span>
        <Toolbar editor={editor} />
        <div className="editor-header-right">
          <ConnectionDot status={status} />
          <PresenceBar provider={provider} />
        </div>
      </div>
      <div className="editor-page">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ConnectionDot({ status }: { status: WebSocketStatus }) {
  const label =
    status === WebSocketStatus.Connected
      ? 'Live'
      : status === WebSocketStatus.Connecting
        ? 'Connecting…'
        : 'Offline';

  return (
    <span className={`conn conn-${status}`} title={`Collab socket: ${status}`}>
      <span className="conn-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
