import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { passwordProblems } from '../../shared/domain/rules';
import { toUserMessage } from '../../shared/domain/errors';
import type { UserRole } from '../../shared/domain/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/ui/Button';
import { Input, RadioCardGroup } from '../components/ui/Field';
import { Card, CardBody, FormError } from '../components/ui/primitives';
import { CheckIcon } from '../components/ui/icons';

type RoleChoice = 'STUDENT' | 'TUTOR' | 'BOTH';

const ROLE_MAP: Record<RoleChoice, UserRole[]> = {
  STUDENT: ['STUDENT'],
  TUTOR: ['TUTOR', 'STUDENT'],
  BOTH: ['STUDENT', 'TUTOR'],
};

/** Live password requirement checklist, so the rules are visible before submitting. */
function PasswordRequirements({ password }: { password: string }) {
  const requirements = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'A lowercase letter', met: /[a-z]/.test(password) },
    { label: 'An uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'A number', met: /[0-9]/.test(password) },
  ];

  return (
    <ul className="space-y-1" aria-label="Password requirements">
      {requirements.map((requirement) => (
        <li
          key={requirement.label}
          className={`flex items-center gap-2 text-sm ${
            requirement.met ? 'text-emerald-800' : 'text-ink-600'
          }`}
        >
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
              requirement.met ? 'bg-emerald-600 text-white' : 'bg-ink-200 text-transparent'
            }`}
            aria-hidden="true"
          >
            <CheckIcon />
          </span>
          {requirement.label}
          <span className="sr-only">{requirement.met ? ' — met' : ' — not yet met'}</span>
        </li>
      ))}
    </ul>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signUp, confirmSignUp, resendConfirmationCode } = useAuth();
  const toast = useToast();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [institution, setInstitution] = useState('');
  const [password, setPassword] = useState('');
  const [roleChoice, setRoleChoice] = useState<RoleChoice | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Only reached on AWS, where Cognito emails a verification code.
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [code, setCode] = useState('');

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/dashboard';
  const passwordValid = useMemo(() => passwordProblems(password).length === 0, [password]);

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setFieldErrors({});

    if (!roleChoice) {
      setFieldErrors({ roles: 'Choose how you want to use the platform.' });
      return;
    }

    setSubmitting(true);
    try {
      const result = await signUp({
        displayName,
        email,
        password,
        roles: ROLE_MAP[roleChoice],
        institution: institution || undefined,
      });

      if (result.needsConfirmation) {
        setAwaitingCode(true);
        toast.info('We emailed you a confirmation code.');
      } else {
        toast.success('Account created. Welcome.');
        navigate(
          roleChoice === 'STUDENT' ? redirectTo : '/dashboard/profile',
          { replace: true },
        );
      }
    } catch (caught) {
      const field = (caught as { field?: string })?.field;
      if (field) setFieldErrors({ [field]: toUserMessage(caught) });
      else setError(toUserMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      // The password is still held in state, so confirmation signs the user in
      // rather than dead-ending on a second login form.
      await confirmSignUp(email, code, password);
      toast.success('Email confirmed. Welcome.');
      navigate(roleChoice === 'STUDENT' ? redirectTo : '/dashboard/profile', {
        replace: true,
      });
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  if (awaitingCode) {
    return (
      <div className="container-page flex justify-center py-8 sm:py-12">
        <div className="w-full max-w-md">
          <h1 className="text-2xl">Confirm your email</h1>
          <p className="mt-1.5 text-ink-600">
            We sent a code to <span className="font-medium text-ink-800">{email}</span>. Enter
            it below to finish creating your account.
          </p>

          <Card className="mt-5">
            <CardBody className="sm:p-6">
              <form onSubmit={handleConfirm} className="space-y-4" noValidate>
                <FormError message={error} />

                <Input
                  label="Confirmation code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />

                <Button
                  type="submit"
                  fullWidth
                  size="lg"
                  loading={submitting}
                  loadingLabel="Confirming…"
                >
                  Confirm and continue
                </Button>
              </form>

              <button
                type="button"
                onClick={async () => {
                  try {
                    await resendConfirmationCode(email);
                    toast.info('A new code is on its way.');
                  } catch (caught) {
                    setError(toUserMessage(caught));
                  }
                }}
                className="mt-4 w-full text-sm font-medium text-primary-700 underline-offset-2 hover:underline"
              >
                Send the code again
              </button>
            </CardBody>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page flex justify-center py-8 sm:py-12">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl">Create your account</h1>
        <p className="mt-1.5 text-ink-600">
          One account covers both sides. You can start as a learner and add tutoring
          later, or do both from the beginning.
        </p>

        <Card className="mt-5">
          <CardBody className="sm:p-6">
            <form onSubmit={handleRegister} className="space-y-5" noValidate>
              <FormError message={error} />

              <RadioCardGroup<RoleChoice>
                legend="How do you want to use it?"
                name="role"
                value={roleChoice}
                onChange={setRoleChoice}
                error={fieldErrors.roles}
                options={[
                  {
                    value: 'STUDENT',
                    title: 'Find a tutor',
                    description: 'Search and book sessions.',
                  },
                  {
                    value: 'TUTOR',
                    title: 'Tutor others',
                    description: 'Publish availability and take requests.',
                  },
                  {
                    value: 'BOTH',
                    title: 'Both',
                    description: 'Learn and tutor.',
                  },
                ]}
              />

              <Input
                label="Full name"
                autoComplete="name"
                required
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                error={fieldErrors.displayName}
                hint="Shown to tutors and students you book with."
              />

              <Input
                label="Email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                error={fieldErrors.email}
              />

              <Input
                label="School, college or university (optional)"
                autoComplete="organization"
                value={institution}
                onChange={(event) => setInstitution(event.target.value)}
                error={fieldErrors.institution}
              />

              <div className="space-y-2">
                <Input
                  label="Password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  error={fieldErrors.password}
                />
                <PasswordRequirements password={password} />
              </div>

              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={submitting}
                loadingLabel="Creating your account…"
                disabled={!passwordValid}
              >
                Create account
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-ink-600">
              Already have an account?{' '}
              <Link
                to="/login"
                state={location.state}
                className="font-medium text-primary-700 underline-offset-2 hover:underline"
              >
                Log in
              </Link>
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
