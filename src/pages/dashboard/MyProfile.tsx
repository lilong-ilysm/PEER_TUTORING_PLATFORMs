import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../lib/api';
import { toUserMessage } from '../../../shared/domain/errors';
import { LIMITS } from '../../../shared/domain/rules';
import {
  LEVEL_LABELS,
  LEVEL_ORDER,
  MODE_LABELS,
  MODE_ORDER,
  subjectsByCategory,
} from '../../../shared/domain/subjects';
import type { AcademicLevel, SessionMode, UserRole } from '../../../shared/domain/types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Checkbox, Input, Select, Textarea, ToggleChip } from '../../components/ui/Field';
import {
  Badge,
  Card,
  CardBody,
  FormError,
  SectionHeading,
} from '../../components/ui/primitives';

export function DashboardProfilePage() {
  const { profile, tutorProfile, isTutor, refreshProfiles } = useAuth();
  const toast = useToast();
  const location = useLocation();

  // Set when a learner is redirected here from a tutor-only route (AC-6).
  const needsTutorRole = (location.state as { needsTutorRole?: boolean } | null)
    ?.needsTutorRole;

  // --- Account form -------------------------------------------------------
  const [displayName, setDisplayName] = useState('');
  const [institution, setInstitution] = useState('');
  const [bio, setBio] = useState('');
  const [wantsToTutor, setWantsToTutor] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  // --- Tutor form ---------------------------------------------------------
  const [headline, setHeadline] = useState('');
  const [tutorBio, setTutorBio] = useState('');
  const [hourlyRate, setHourlyRate] = useState('15');
  const [sessionMode, setSessionMode] = useState<SessionMode>('EITHER');
  const [levels, setLevels] = useState<AcademicLevel[]>([]);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [isPublished, setIsPublished] = useState(true);
  const [savingTutor, setSavingTutor] = useState(false);
  const [tutorError, setTutorError] = useState<string | null>(null);

  // Hydrate from the loaded records.
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    setInstitution(profile.institution ?? '');
    setBio(profile.bio ?? '');
    setWantsToTutor(profile.roles.includes('TUTOR'));
  }, [profile]);

  useEffect(() => {
    if (!tutorProfile) return;
    setHeadline(tutorProfile.headline);
    setTutorBio(tutorProfile.bio);
    setHourlyRate(String(tutorProfile.hourlyRate));
    setSessionMode(tutorProfile.sessionMode);
    setLevels(tutorProfile.levels);
    setSubjectIds(tutorProfile.subjectIds);
    setIsPublished(tutorProfile.isPublished);
  }, [tutorProfile]);

  async function handleSaveAccount(event: React.FormEvent) {
    event.preventDefault();
    if (savingAccount) return;

    setSavingAccount(true);
    setAccountError(null);

    try {
      const roles: UserRole[] = wantsToTutor ? ['STUDENT', 'TUTOR'] : ['STUDENT'];
      await api.updateMyUserProfile({ displayName, institution, bio, roles });
      await refreshProfiles();
      toast.success('Account details saved.');
    } catch (error) {
      setAccountError(toUserMessage(error));
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleSaveTutor(event: React.FormEvent) {
    event.preventDefault();
    if (savingTutor) return;

    setSavingTutor(true);
    setTutorError(null);

    try {
      await api.saveMyTutorProfile({
        headline,
        bio: tutorBio,
        hourlyRate: Number(hourlyRate),
        sessionMode,
        levels,
        subjectIds,
        isPublished,
      });
      await refreshProfiles();
      toast.success(
        isPublished
          ? 'Tutor profile saved and visible to students.'
          : 'Tutor profile saved as a draft.',
      );
    } catch (error) {
      setTutorError(toUserMessage(error));
    } finally {
      setSavingTutor(false);
    }
  }

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl">My profile</h1>
        <p className="mt-1 text-ink-600">
          Your account details, and your public tutor profile if you tutor.
        </p>
      </div>

      {needsTutorRole ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-amber-950">
          <p>
            That page is for tutors. Turn on tutoring below to publish availability and
            take requests.
          </p>
        </div>
      ) : null}

      {/* --- Account --- */}
      <section aria-labelledby="account-heading">
        <SectionHeading title="Account" id="account-heading" />
        <Card>
          <CardBody className="sm:p-6">
            <form onSubmit={handleSaveAccount} className="space-y-4" noValidate>
              <FormError message={accountError} />

              <Input
                label="Full name"
                required
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                hint="Shown on your tutor profile and to people you book with."
              />

              <Input
                label="Email"
                type="email"
                value={profile?.email ?? ''}
                disabled
                readOnly
                hint="Your email is your sign-in and cannot be changed here."
              />

              <Input
                label="School, college or university"
                value={institution}
                onChange={(event) => setInstitution(event.target.value)}
              />

              <Textarea
                label="About you (optional)"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                maxLength={LIMITS.bioMax}
                placeholder="What you are studying, and what you are working on at the moment."
              />

              <div className="rounded-lg border border-ink-200 bg-ink-50 p-3.5">
                <Checkbox
                  label="I want to tutor other students"
                  description="Adds the tutor side of the platform: a public profile, availability and incoming requests."
                  checked={wantsToTutor}
                  onChange={(event) => setWantsToTutor(event.target.checked)}
                />
              </div>

              <Button
                type="submit"
                loading={savingAccount}
                loadingLabel="Saving…"
              >
                Save account details
              </Button>
            </form>
          </CardBody>
        </Card>
      </section>

      {/* --- Tutor profile --- */}
      {isTutor || wantsToTutor ? (
        <section aria-labelledby="tutor-heading">
          <SectionHeading
            title="Tutor profile"
            id="tutor-heading"
            description="This is what students see. You are only discoverable once it is published with at least one subject."
            action={
              tutorProfile ? (
                <ButtonLink
                  to={`/tutors/${tutorProfile.id}`}
                  variant="secondary"
                  size="sm"
                >
                  View as student
                </ButtonLink>
              ) : undefined
            }
          />

          <div className="mb-3">
            {tutorProfile?.isPublished && tutorProfile.subjectIds.length > 0 ? (
              <Badge tone="success">Published and discoverable</Badge>
            ) : (
              <Badge tone="pending">Not visible to students</Badge>
            )}
          </div>

          <Card>
            <CardBody className="sm:p-6">
              <form onSubmit={handleSaveTutor} className="space-y-5" noValidate>
                <FormError message={tutorError} />

                <Input
                  label="Headline"
                  required
                  value={headline}
                  onChange={(event) => setHeadline(event.target.value)}
                  maxLength={LIMITS.headlineMax}
                  placeholder="Third-year maths student, calculus and linear algebra"
                  hint="One line summarising what you cover. Shown on your card in search."
                />

                <Textarea
                  label="How you tutor"
                  required
                  value={tutorBio}
                  onChange={(event) => setTutorBio(event.target.value)}
                  maxLength={LIMITS.bioMax}
                  placeholder="What you cover, how you run a session, and what a student should bring. Being specific gets you better-matched requests."
                  hint="At least a couple of sentences."
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Hourly rate (GBP)"
                    type="number"
                    min={0}
                    max={LIMITS.hourlyRateMax}
                    step="0.5"
                    required
                    value={hourlyRate}
                    onChange={(event) => setHourlyRate(event.target.value)}
                    hint="Enter 0 if you tutor for free. No payments are handled by the platform."
                  />

                  <Select
                    label="Session type"
                    required
                    value={sessionMode}
                    onChange={(event) => setSessionMode(event.target.value as SessionMode)}
                    options={MODE_ORDER.map((mode) => ({
                      value: mode,
                      label: MODE_LABELS[mode],
                    }))}
                  />
                </div>

                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-ink-700">
                    Levels you can teach <span className="text-rose-600">*</span>
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {LEVEL_ORDER.map((level) => (
                      <ToggleChip
                        key={level}
                        name="levels"
                        selected={levels.includes(level)}
                        onToggle={() => setLevels((current) => toggle(current, level))}
                      >
                        {LEVEL_LABELS[level]}
                      </ToggleChip>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-ink-700">
                    Subjects you can tutor <span className="text-rose-600">*</span>
                  </legend>
                  <p className="mb-2 text-sm text-ink-500">
                    {subjectIds.length} selected. Only pick subjects you would be
                    comfortable being asked about.
                  </p>
                  <div className="space-y-3">
                    {subjectsByCategory().map((group) => (
                      <div key={group.category}>
                        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                          {group.category}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {group.subjects.map((subject) => (
                            <ToggleChip
                              key={subject.id}
                              name="subjects"
                              selected={subjectIds.includes(subject.id)}
                              onToggle={() =>
                                setSubjectIds((current) => toggle(current, subject.id))
                              }
                            >
                              {subject.name}
                            </ToggleChip>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </fieldset>

                <div className="rounded-lg border border-ink-200 bg-ink-50 p-3.5">
                  <Checkbox
                    label="Publish my profile"
                    description="Unpublish at any time to stop appearing in search. Existing confirmed sessions are not affected."
                    checked={isPublished}
                    onChange={(event) => setIsPublished(event.target.checked)}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" loading={savingTutor} loadingLabel="Saving…">
                    {tutorProfile ? 'Save tutor profile' : 'Create tutor profile'}
                  </Button>
                  {tutorProfile ? (
                    <Link
                      to="/dashboard/availability"
                      className="text-sm font-medium text-primary-700 underline-offset-2 hover:underline"
                    >
                      Manage availability
                    </Link>
                  ) : null}
                </div>

                {!tutorProfile ? (
                  <p className="text-sm text-ink-500">
                    After saving, add availability so students can book you.
                  </p>
                ) : null}
              </form>
            </CardBody>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
