/**
 * Route protection (AC-5, AC-6).
 *
 * These guards control what the UI *renders*. They are not the security boundary:
 * that lives in Cognito authorisation rules and the session-actions Lambda. A user
 * who edits their own client bundle gains nothing, because the backend re-derives
 * their identity and re-checks every rule.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../ui/primitives';

function FullPageLoading({ label }: { label: string }) {
  return (
    <div className="container-page flex min-h-[50vh] items-center justify-center">
      <Spinner label={label} />
    </div>
  );
}

/** Requires a signed-in user, preserving the intended destination (AC-5). */
export function RequireAuth() {
  const { initialising, isAuthenticated } = useAuth();
  const location = useLocation();

  if (initialising) return <FullPageLoading label="Checking your session" />;

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        // `from` is read back after a successful sign-in so the user lands where
        // they were going, not on a generic dashboard.
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <Outlet />;
}

/**
 * Requires the tutor role. Typing `/dashboard/availability` as a learner lands
 * here and is redirected, rather than rendering a broken page (AC-6).
 */
export function RequireTutor() {
  const { initialising, isAuthenticated, isTutor } = useAuth();
  const location = useLocation();

  if (initialising) return <FullPageLoading label="Checking your access" />;

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  if (!isTutor) {
    return <Navigate to="/dashboard/profile" replace state={{ needsTutorRole: true }} />;
  }

  return <Outlet />;
}

/** Keeps a signed-in user off the login and register pages. */
export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { initialising, isAuthenticated } = useAuth();

  if (initialising) return <FullPageLoading label="Checking your session" />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
