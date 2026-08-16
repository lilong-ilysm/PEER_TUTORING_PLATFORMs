import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toUserMessage } from '../../shared/domain/errors';
import { DEMO_PASSWORD, IS_DEMO_MODE } from '../lib/config';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { Card, CardBody, FormError } from '../components/ui/primitives';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AC-5: return to wherever the user was trying to go.
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const signedIn = await signIn(email, password);

      // Route by role. An administrator lands in the admin panel unless they were
      // deep-linked somewhere specific, in which case that intent is honoured.
      const wasDeepLinked = Boolean((location.state as { from?: string } | null)?.from);
      const target = signedIn.roles.includes('ADMIN') && !wasDeepLinked
        ? '/admin'
        : redirectTo;

      navigate(target, { replace: true });
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container-page flex justify-center py-8 sm:py-12">
      <div className="w-full max-w-md">
        <h1 className="text-2xl">Log in</h1>
        <p className="mt-1.5 text-ink-600">
          Sign in to request sessions, manage your availability and message your tutors.
        </p>

        <Card className="mt-5">
          <CardBody className="space-y-4 sm:p-6">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <FormError message={error} />

              <Input
                label="Email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />

              <Input
                label="Password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />

              <Button type="submit" fullWidth size="lg" loading={submitting} loadingLabel="Signing in…">
                Log in
              </Button>
            </form>

            <p className="text-center text-sm text-ink-600">
              Do not have an account?{' '}
              <Link
                to="/register"
                state={location.state}
                className="font-medium text-primary-700 underline-offset-2 hover:underline"
              >
                Create one
              </Link>
            </p>
          </CardBody>
        </Card>

        {/*
          Demo credentials are shown only in demo mode, where the data is local to
          this browser. They are not secrets and there is nothing to protect.
        */}
        {IS_DEMO_MODE ? (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Demo accounts</p>
            <p className="mt-1">
              Password for all demo accounts: <code className="font-mono">{DEMO_PASSWORD}</code>
            </p>
            <ul className="mt-2 space-y-1">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('student@demo.peertutor.app');
                    setPassword(DEMO_PASSWORD);
                  }}
                  className="font-mono underline underline-offset-2"
                >
                  student@demo.peertutor.app
                </button>{' '}
                — learner
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('amara@demo.peertutor.app');
                    setPassword(DEMO_PASSWORD);
                  }}
                  className="font-mono underline underline-offset-2"
                >
                  amara@demo.peertutor.app
                </button>{' '}
                — tutor and learner
              </li>
            </ul>
            <p className="mt-2 text-amber-900">
              Click an address to fill the form.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
