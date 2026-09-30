import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth';

/**
 * Gate for routes that need a signed-in user.
 *
 * It waits for the first /auth/me round trip before deciding - redirecting
 * while `isLoading` is still true would bounce a signed-in user to /login on
 * every hard refresh. The current path is passed along so sign-in can return
 * the user to where they were headed.
 *
 * This is a UX convenience only. It is not access control: the server decides,
 * and every protected endpoint already rejects anonymous callers with 401.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="editor-loading">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
