import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Editor } from '../editor/Editor';
import { type DocumentSummary, authApi, documentsApi } from '../lib/api';

export function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocumentSummary | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    void (async () => {
      try {
        // The collab token is fetched alongside the document: the session lives
        // in an httpOnly cookie that JS cannot read, so the provider needs a
        // separate short-lived token it can actually be handed.
        const [{ document }, { token: collabToken }] = await Promise.all([
          documentsApi.get(id),
          authApi.collabToken(),
        ]);
        if (!cancelled) {
          setDoc(document);
          setToken(collabToken);
        }
      } catch {
        if (!cancelled) setError('Could not open that document.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="doc-error">
        <p>{error}</p>
        <Link to="/">Back to your documents</Link>
      </div>
    );
  }

  if (!id || !doc || token === null) {
    return <div className="editor-loading">Loading…</div>;
  }

  return <Editor documentName={doc.id} title={doc.title} token={token} />;
}
