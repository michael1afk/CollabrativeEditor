import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { type DocumentSummary, documentsApi } from '../lib/api';
import { useAuth } from '../lib/auth';

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { documents } = await documentsApi.list();
      setDocs(documents);
    } catch {
      setError('Could not load your documents.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onCreate(): Promise<void> {
    setCreating(true);
    try {
      const { document } = await documentsApi.create();
      void navigate(`/doc/${document.id}`);
    } catch {
      setError('Could not create a document.');
      setCreating(false);
    }
  }

  async function onDelete(id: string, title: string): Promise<void> {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) {
      return;
    }
    try {
      await documentsApi.remove(id);
      await refresh();
    } catch {
      setError('Could not delete that document.');
    }
  }

  return (
    <div className="dash">
      <header className="dash-bar">
        <span className="app-title">Collab Editor</span>
        <div className="dash-bar-right">
          {user && (
            <span className="who">
              <span className="who-dot" style={{ backgroundColor: user.color }} />
              {user.displayName}
              {user.isGuest && <span className="badge badge-idle">guest</span>}
            </span>
          )}
          <button type="button" className="btn btn-sm" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="dash-main">
        <div className="dash-head">
          <h1>Your documents</h1>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void onCreate()}
            disabled={creating}
          >
            {creating ? 'Creating…' : 'New document'}
          </button>
        </div>

        {error && <p className="auth-error">{error}</p>}

        {docs === null && <p className="muted">Loading…</p>}

        {docs !== null && docs.length === 0 && (
          <p className="muted">
            Nothing here yet. Create your first document to start writing.
          </p>
        )}

        {docs !== null && docs.length > 0 && (
          <ul className="doc-list">
            {docs.map((doc) => (
              <li key={doc.id}>
                <Link to={`/doc/${doc.id}`} className="doc-link">
                  <span className="doc-title">{doc.title}</span>
                  <span className="doc-meta">
                    {doc.role ?? 'no role'} · edited{' '}
                    {new Date(doc.updatedAt).toLocaleString()}
                  </span>
                </Link>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => void onDelete(doc.id, doc.title)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
