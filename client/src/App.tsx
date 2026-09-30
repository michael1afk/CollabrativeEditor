import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './lib/RequireAuth';
import { useAuth } from './lib/auth';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentPage } from './pages/DocumentPage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfSignedIn>
            <LoginPage mode="login" />
          </RedirectIfSignedIn>
        }
      />
      <Route
        path="/signup"
        element={
          <RedirectIfSignedIn>
            <LoginPage mode="signup" />
          </RedirectIfSignedIn>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/doc/:id"
        element={
          <RequireAuth>
            <DocumentPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/** Keeps a signed-in user off the auth screens. */
function RedirectIfSignedIn({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return <div className="editor-loading">Loading…</div>;
  }
  return user ? <Navigate to="/" replace /> : <>{children}</>;
}
