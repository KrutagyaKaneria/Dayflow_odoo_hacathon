import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { signIn } from './api';
import './SignInPage.css';

// No phase before this one built a frontend Sign In screen (Phase 02 built only the backend
// endpoint and token issuance; Phase 03 built the storage/guard primitives). Phase 05 needs one
// for "default post-login redirect target" to mean anything, and for <RequireAuth>'s redirect
// target (/signin) to actually resolve to a real page — so it's built here, minimally.
export function SignInPage() {
  const { user, setAccessToken } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    // Already signed in — go straight to the landing page instead of showing the form again.
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const data = await signIn(identifier, password);
      setAccessToken(data.accessToken);
      navigate('/', { replace: true });
    } catch (err) {
      // TODO(D-18): no forgot-password flow exists yet (Phase 02) — this is the point where a
      // "forgot password?" link would eventually go.
      setError(err.message || 'Invalid credentials.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="signin-page">
      <form className="signin-page__form" onSubmit={handleSubmit}>
        <h1>Sign in to Dayflow</h1>
        <label>
          Login ID / Email
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="signin-page__error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
