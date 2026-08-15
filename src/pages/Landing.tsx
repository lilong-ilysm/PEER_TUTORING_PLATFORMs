import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { sortTutors } from '../../shared/domain/search';
import { LEVEL_LABELS, LEVEL_ORDER, MODE_LABELS, SUBJECTS } from '../../shared/domain/subjects';
import { pluralise } from '../lib/utils';
import { Select, Input } from '../components/ui/Field';
import { Button, ButtonLink } from '../components/ui/Button';
import { TutorCard } from '../components/tutors/TutorCard';
import { EmptyState, ErrorState, SectionHeading, TutorCardSkeleton } from '../components/ui/primitives';
import { SearchIcon } from '../components/ui/icons';
import { useAuth } from '../context/AuthContext';

/**
 * Landing page.
 *
 * Structured against AC-37 and AC-38: a real search control sits above the fold, and
 * every number on this page is computed from records that exist. There are no
 * invented statistics, no testimonials, and the primary call to action appears once.
 */
export function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [q, setQ] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [level, setLevel] = useState('');
  const [mode, setMode] = useState('');

  const { data: listings, loading, error, reload } = useAsync(
    () => api.listTutorListings(),
    [],
  );

  // Only subjects that a real tutor actually teaches, with a real count.
  const subjectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const listing of listings ?? []) {
      for (const id of listing.subjectIds) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([id, count]) => ({
        subject: SUBJECTS.find((candidate) => candidate.id === id),
        count,
      }))
      .filter((entry) => entry.subject)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [listings]);

  const featured = useMemo(() => {
    const withAvailability = (listings ?? []).filter(
      (listing) => listing.openSlotCount > 0,
    );
    return sortTutors(withAvailability, 'SOONEST').slice(0, 6);
  }, [listings]);

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (subjectId) params.set('subject', subjectId);
    if (level) params.set('level', level);
    if (mode) params.set('mode', mode);
    navigate(`/tutors${params.toString() ? `?${params.toString()}` : ''}`);
  }

  const tutorCount = listings?.length ?? 0;

  return (
    <>
      {/* --- Orientation + search. Compact by design: the search control must be
          visible without scrolling at 1440px. --- */}
      <section className="border-b border-ink-200 bg-white">
        <div className="container-page py-8 sm:py-10">
          <div className="max-w-2xl">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl">
              Find a peer tutor and book a time that works
            </h1>
            <p className="mt-3 text-lg text-ink-600">
              Search students who tutor the subject you need, see when they are
              genuinely free, and request a session. If you tutor as well, publish your
              own availability and take requests.
            </p>
          </div>

          <form
            onSubmit={handleSearch}
            className="mt-6 rounded-xl border border-ink-200 bg-ink-50 p-4 sm:p-5"
            role="search"
            aria-label="Find a tutor"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2 lg:col-span-1">
                <Input
                  label="Keyword"
                  type="search"
                  placeholder="Name or keyword"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  leadingIcon={<SearchIcon />}
                />
              </div>
              <Select
                label="Subject"
                placeholder="Any subject"
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
                options={SUBJECTS.map((subject) => ({
                  value: subject.id,
                  label: subject.name,
                }))}
              />
              <Select
                label="Level"
                placeholder="Any level"
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                options={LEVEL_ORDER.map((value) => ({
                  value,
                  label: LEVEL_LABELS[value],
                }))}
              />
              <Select
                label="Session type"
                placeholder="Online or in person"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
                options={[
                  { value: 'ONLINE', label: MODE_LABELS.ONLINE },
                  { value: 'IN_PERSON', label: MODE_LABELS.IN_PERSON },
                ]}
              />
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-600">
                {loading
                  ? 'Loading tutors…'
                  : tutorCount > 0
                    ? `${tutorCount} ${pluralise(tutorCount, 'tutor')} currently listed`
                    : 'No tutors are listed yet'}
              </p>
              <Button type="submit" size="lg" className="sm:w-auto">
                Search tutors
              </Button>
            </div>
          </form>

          {/* Real subject counts, or nothing at all. */}
          {subjectCounts.length > 0 ? (
            <div className="mt-5">
              <h2 className="text-sm font-semibold text-ink-700">Browse by subject</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {subjectCounts.map(({ subject, count }) => (
                  <li key={subject!.id}>
                    <Link
                      to={`/tutors?subject=${subject!.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3 py-1.5 text-sm text-ink-800 hover:border-primary-400 hover:bg-primary-50"
                    >
                      {subject!.name}
                      <span className="text-ink-500">{count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      {/* --- Live tutors. Showing the product beats describing it. --- */}
      <section className="container-page py-8 sm:py-10">
        <SectionHeading
          title="Available soon"
          description="Tutors with upcoming open times, soonest first."
          action={
            <Link
              to="/tutors"
              className="text-sm font-medium text-primary-700 underline-offset-2 hover:underline"
            >
              See all tutors
            </Link>
          }
        />

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <TutorCardSkeleton key={index} />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : featured.length === 0 ? (
          <EmptyState
            title="No open times published yet"
            description={
              tutorCount > 0
                ? 'Tutors are listed but none have upcoming availability. You can still browse profiles and check back later.'
                : 'Nobody has published a tutor profile yet. If you can help other students, you could be the first.'
            }
            action={
              tutorCount > 0 ? (
                <ButtonLink to="/tutors" variant="secondary">
                  Browse all tutors
                </ButtonLink>
              ) : (
                <ButtonLink to="/register">Become a tutor</ButtonLink>
              )
            }
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {featured.map((listing) => (
              <li key={listing.tutorProfile.id} className="flex">
                <div className="w-full">
                  <TutorCard listing={listing} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- How it works. Text only. A two-sided request/accept model has to be
          explained once, or people will not trust it. --- */}
      <section className="border-t border-ink-200 bg-white py-8 sm:py-10">
        <div className="container-page">
          <SectionHeading
            title="How booking works"
            description="Requests are not automatic. A tutor confirms before anything is scheduled."
          />

          <ol className="grid gap-4 sm:grid-cols-3">
            {[
              {
                step: '1',
                title: 'Find and compare',
                body: 'Filter by subject, level, session type, rate and the day you are free. Ratings come only from students who completed a session.',
              },
              {
                step: '2',
                title: 'Request a time',
                body: 'Pick from the times a tutor has actually published and say what you need help with. The slot is held while they respond.',
              },
              {
                step: '3',
                title: 'Meet and review',
                body: 'Once confirmed you can message to sort out details. After the session, your review updates the tutor\u2019s public rating.',
              },
            ].map((item) => (
              <li key={item.step} className="rounded-xl border border-ink-200 p-4">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-sm font-bold text-primary-800"
                  aria-hidden="true"
                >
                  {item.step}
                </span>
                <h3 className="mt-3 text-base">{item.title}</h3>
                <p className="mt-1.5 text-sm text-ink-600">{item.body}</p>
              </li>
            ))}
          </ol>

          {/* The one place a sign-up prompt appears, and only for guests. */}
          {!isAuthenticated ? (
            <div className="mt-6 flex flex-col gap-3 rounded-xl border border-ink-200 bg-ink-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-ink-700">
                You need an account to request a session or to tutor others.
              </p>
              <ButtonLink to="/register" className="shrink-0">
                Create an account
              </ButtonLink>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
