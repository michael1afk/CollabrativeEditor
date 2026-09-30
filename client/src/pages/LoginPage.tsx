import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

type Mode = 'login' | 'signup';

export function LoginPage({ mode }: { mode: Mode }) {
  const { login, signup, continueAsGuest } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Where the protected route sent us from, so sign-in returns there.
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
      void navigate(from, { replace: true });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent): void {
    event.preventDefault();
    void run(() =>
      mode === 'login'
        ? login(email, password)
        : signup(email, password, displayName.trim() || undefined),
    );
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>{mode === 'login' ? 'Sign in' : 'Create an account'}</h1>

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>

        {mode === 'signup' && (
          <label>
            Display name <span className="hint">(optional)</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="nickname"
              maxLength={80}
            />
          </label>
        )}

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={8}
            required
          />
        </label>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Sign up'}
        </button>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void run(continueAsGuest)}
        >
          Continue as guest
        </button>

        <p className="auth-alt">
          {mode === 'login' ? (
            <>
              No account? <Link to="/signup">Sign up</Link>
            </>
          ) : (
            <>
              Already have one? <Link to="/login">Sign in</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}

function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Something went wrong. Please try again.';
  }
  switch (error.code) {
    case 'invalid_credentials':
      return 'That email and password do not match.';
    case 'email_taken':
      return 'An account with that email already exists.';
    case 'invalid_credentials_format':
      return 'Enter a valid email and a password of at least 8 characters.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
