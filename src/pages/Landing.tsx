import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { sortTutors } from '../../shared/domain/search';
import { SUBJECTS } from '../../shared/domain/subjects';
import type { Review, TutorListing } from '../../shared/domain/types';
import { formatRate, pluralise } from '../lib/utils';
import { Input, Select } from '../components/ui/Field';
import { Button, ButtonLink } from '../components/ui/Button';
import { TutorCard } from '../components/tutors/TutorCard';
import {
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  Rating,
  SectionHeading,
  TutorCardSkeleton,
} from '../components/ui/primitives';
import {
  BookIcon,
  CalendarIcon,
  CheckIcon,
  SearchIcon,
  UserIcon,
  VideoIcon,
} from '../components/ui/icons';
import { useAuth } from '../context/AuthContext';

/**
 * Homepage.
 *
 * Structured as: value proposition -> search -> trust -> real tutors -> subjects ->
 * why -> how -> real reviews -> closing action.
 *
 * EVERY NUMBER ON THIS PAGE IS DERIVED FROM RECORDS THAT EXIST. There are no
 * invented statistics, no stock testimonials and no placeholder logos. Where there
 * is no data, the section hides itself rather than inventing filler. That is a
 * harder constraint to design around than a marketing page, but it means nothing on
 * screen is a claim the product cannot back.
 *
 * The hero keeps a search control because finding a tutor is the job, but only two
 * fields: a full filter form belongs on /tutors, not on the front door.
 */
export function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isTutor } = useAuth();

  const [q, setQ] = useState('');
  const [subjectId, setSubjectId] = useState('');

  const {
    data: listings,
    loading,
    error,
    reload,
  } = useAsync(() => api.listTutorListings(), []);

  // ---------------------------------------------------------------------------
  // Everything below is computed from the loaded listings.
  // ---------------------------------------------------------------------------

  const stats = useMemo(() => {
    const items = listings ?? [];
    const subjectIds = new Set<string>();
    let reviewCount = 0;
    let onlineCount = 0;
    let inPersonCount = 0;
    let withAvailability = 0;
    let freeCount = 0;

    for (const listing of items) {
      listing.subjectIds.forEach((id) => subjectIds.add(id));
      reviewCount += listing.tutorProfile.ratingCount;
      if (listing.tutorProfile.sessionMode !== 'IN_PERSON') onlineCount += 1;
      if (listing.tutorProfile.sessionMode !== 'ONLINE') inPersonCount += 1;
      if (listing.openSlotCount > 0) withAvailability += 1;
      if (listing.tutorProfile.hourlyRate === 0) freeCount += 1;
    }

    const rates = items
      .map((listing) => listing.tutorProfile.hourlyRate)
      .filter((rate) => rate > 0);

    return {
      tutors: items.length,
      subjects: subjectIds.size,
      reviewCount,
      onlineCount,
      inPersonCount,
      withAvailability,
      freeCount,
      lowestRate: rates.length > 0 ? Math.min(...rates) : null,
    };
  }, [listings]);

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
      .filter((entry): entry is { subject: (typeof SUBJECTS)[number]; count: number } =>
        Boolean(entry.subject),
      )
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [listings]);

  /** Tutors with genuine upcoming availability, soonest first. */
  const featured = useMemo(() => {
    const withSlots = (listings ?? []).filter((listing) => listing.openSlotCount > 0);
    // Fall back to top-rated if nobody has published times yet, so the section is
    // still useful rather than empty.
    const pool = withSlots.length > 0 ? withSlots : (listings ?? []);
    return sortTutors(pool, withSlots.length > 0 ? 'SOONEST' : 'RATING_DESC').slice(0, 6);
  }, [listings]);

  // Real reviews, pulled from the three most-reviewed tutors. Skipped entirely when
  // nobody has been reviewed, so no request is wasted and nothing is faked.
  const reviewTargets = useMemo(
    () =>
      (listings ?? [])
        .filter((listing) => listing.tutorProfile.ratingCount > 0)
        .sort((a, b) => b.tutorProfile.ratingCount - a.tutorProfile.ratingCount)
        .slice(0, 3),
    [listings],
  );

  const { data: socialProof } = useAsync<{ review: Review; tutor: TutorListing }[]>(
    async () => {
      if (reviewTargets.length === 0) return [];
      const perTutor = await Promise.all(
        reviewTargets.map(async (tutor) => {
          const reviews = await api.listReviewsForTutor(tutor.tutorProfile.id);
          return reviews
            .filter((review) => review.comment.trim().length > 40 && review.rating >= 4)
            .slice(0, 1)
            .map((review) => ({ review, tutor }));
        }),
      );
      return perTutor.flat().slice(0, 3);
    },
    [reviewTargets.map((tutor) => tutor.tutorProfile.id).join(',')],
  );

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (subjectId) params.set('subject', subjectId);
    navigate(`/tutors${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <>
      {/* ===================== HERO ===================== */}
      <section className="border-b border-ink-200 bg-white">
        <div className="container-page py-10 lg:py-14">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center lg:gap-12">
            <div className="max-w-xl">
              <h1 className="text-3xl leading-tight sm:text-4xl">
                Find a tutor who understands what you&rsquo;re learning.
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-ink-600">
                Learn from fellow students who have already been through the courses
                you&rsquo;re taking. Find the right tutor, choose a time that works, and get
                the help you need.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink to="/tutors" size="lg">
                  Find a tutor
                </ButtonLink>
                {/* Only offered to people who are not already tutoring. */}
                {!isTutor ? (
                  <ButtonLink
                    to={isAuthenticated ? '/dashboard/profile' : '/register'}
                    variant="secondary"
                    size="lg"
                  >
                    Become a tutor
                  </ButtonLink>
                ) : (
                  <ButtonLink to="/dashboard" variant="secondary" size="lg">
                    Go to dashboard
                  </ButtonLink>
                )}
              </div>

              <p className="mt-4 text-sm text-ink-500">
                Free to browse. You only need an account to request a session.
              </p>
            </div>

            {/* Compact search: two fields, not a filter panel. */}
            <Card className="lg:justify-self-end lg:w-full">
              <CardBody className="sm:p-6">
                <h2 className="text-base font-semibold text-ink-900">
                  Search by subject
                </h2>
                <form onSubmit={handleSearch} className="mt-3 space-y-3" role="search">
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
                  <Input
                    label="Keyword (optional)"
                    type="search"
                    placeholder="Topic, name or university"
                    value={q}
                    onChange={(event) => setQ(event.target.value)}
                    leadingIcon={<SearchIcon />}
                  />
                  <Button type="submit" fullWidth size="lg">
                    Search tutors
                  </Button>
                </form>
                <p className="mt-3 text-sm text-ink-500">
                  {loading
                    ? 'Loading tutors…'
                    : stats.tutors > 0
                      ? `${stats.tutors} ${pluralise(stats.tutors, 'tutor')} across ${stats.subjects} ${pluralise(stats.subjects, 'subject')}`
                      : 'No tutors are listed yet.'}
                </p>
              </CardBody>
            </Card>
          </div>
        </div>
      </section>

      {/* ===================== TRUST ===================== */}
      {/* Rendered only when there is real data behind it. */}
      {!loading && stats.tutors > 0 ? (
        <section aria-label="At a glance" className="border-b border-ink-200 bg-ink-50">
          <div className="container-page py-6">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              {[
                {
                  icon: <UserIcon />,
                  value: `${stats.tutors}`,
                  label: `student ${pluralise(stats.tutors, 'tutor')} listed`,
                },
                {
                  icon: <CalendarIcon />,
                  value: `${stats.withAvailability}`,
                  label: 'with times open now',
                },
                {
                  icon: <BookIcon />,
                  value: `${stats.subjects}`,
                  label: `${pluralise(stats.subjects, 'subject')} covered`,
                },
                {
                  icon: <CheckIcon />,
                  value: `${stats.reviewCount}`,
                  label: `${pluralise(stats.reviewCount, 'review')} from completed sessions`,
                },
              ].map((stat) => (
                <div key={stat.label} className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-primary-700 shadow-card"
                    aria-hidden="true"
                  >
                    {stat.icon}
                  </span>
                  <div className="min-w-0">
                    <dt className="sr-only">{stat.label}</dt>
                    <dd>
                      <span className="block text-xl font-semibold text-ink-900">
                        {stat.value}
                      </span>
                      <span className="block text-sm leading-snug text-ink-600">
                        {stat.label}
                      </span>
                    </dd>
                  </div>
                </div>
              ))}
            </dl>

            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-600">
              {stats.onlineCount > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="text-ink-400">
                    <VideoIcon />
                  </span>
                  {stats.onlineCount} available online
                </span>
              ) : null}
              {stats.lowestRate !== null ? (
                <span>From {formatRate(stats.lowestRate)} per hour</span>
              ) : null}
              {stats.freeCount > 0 ? (
                <span>
                  {stats.freeCount} {pluralise(stats.freeCount, 'tutor')} volunteering for
                  free
                </span>
              ) : null}
            </p>
          </div>
        </section>
      ) : null}

      {/* ===================== FEATURED TUTORS ===================== */}
      <section className="container-page py-10">
        <SectionHeading
          title={
            stats.withAvailability > 0 ? 'Tutors with times open now' : 'Tutors on PeerTutor'
          }
          description={
            stats.withAvailability > 0
              ? 'Real published availability, soonest first.'
              : 'Browse profiles and check back for new availability.'
          }
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
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <li key={index}>
                <TutorCardSkeleton />
              </li>
            ))}
          </ul>
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : featured.length === 0 ? (
          <EmptyState
            title="No tutors have published a profile yet"
            description="If you can help other students with a subject you have already studied, you could be the first."
            action={
              <ButtonLink to={isAuthenticated ? '/dashboard/profile' : '/register'}>
                Become a tutor
              </ButtonLink>
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

      {/* ===================== SUBJECTS ===================== */}
      {subjectCounts.length > 0 ? (
        <section className="border-y border-ink-200 bg-white py-10">
          <div className="container-page">
            <SectionHeading
              title="Popular subjects"
              description="Counts are the number of tutors currently offering each subject."
              action={
                <Link
                  to="/subjects"
                  className="text-sm font-medium text-primary-700 underline-offset-2 hover:underline"
                >
                  All subjects
                </Link>
              }
            />
            <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {subjectCounts.map(({ subject, count }) => (
                <li key={subject.id}>
                  <Link
                    to={`/tutors?subject=${subject.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-ink-200 bg-white px-3.5 py-3 transition-colors hover:border-primary-400 hover:bg-primary-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink-900">
                        {subject.name}
                      </span>
                      <span className="block truncate text-xs text-ink-500">
                        {subject.category}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-700">
                      {count}
                      <span className="sr-only"> {pluralise(count, 'tutor')}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ===================== WHY ===================== */}
      <section className="container-page py-10">
        <SectionHeading title="Why PeerTutor" />
        <ul className="grid gap-4 sm:grid-cols-2">
          {[
            {
              title: 'Learn from someone who has been there',
              body: 'Get help from students who understand the courses and subjects you are currently studying, often from the same institution.',
            },
            {
              title: 'See real availability',
              body: 'Choose from times a tutor has actually published, instead of messaging back and forth to find a slot.',
            },
            {
              title: 'Learn your way',
              body: 'Online or in person, whichever the tutor offers. You can filter by either.',
            },
            {
              title: 'Make an informed choice',
              body: 'Compare subjects, levels, rates and reviews. Ratings come only from students who completed a session.',
            },
          ].map((item) => (
            <li key={item.title}>
              <div className="flex h-full gap-3 rounded-xl border border-ink-200 bg-white p-4">
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700"
                  aria-hidden="true"
                >
                  <CheckIcon />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-600">{item.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ===================== HOW IT WORKS ===================== */}
      <section className="border-y border-ink-200 bg-white py-10">
        <div className="container-page">
          <SectionHeading
            title="How PeerTutor works"
            description="Requests are not automatic. A tutor confirms before anything is scheduled."
          />
          <ol className="grid gap-4 sm:grid-cols-3">
            {[
              {
                step: '01',
                title: 'Find a tutor',
                body: 'Search by subject, level, session type, rate and the days you are free.',
              },
              {
                step: '02',
                title: 'Choose a time',
                body: 'Pick from the tutor’s published slots and say what you need help with.',
              },
              {
                step: '03',
                title: 'Learn together',
                body: 'Attend the session, then leave a review that updates their public rating.',
              },
            ].map((item) => (
              <li key={item.step} className="rounded-xl border border-ink-200 p-4">
                <span className="text-sm font-bold tracking-wide text-primary-700">
                  {item.step}
                </span>
                <h3 className="mt-1.5 text-base">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ===================== REAL REVIEWS ===================== */}
      {/* Hidden entirely when there are no genuine reviews to show. */}
      {socialProof && socialProof.length > 0 ? (
        <section className="container-page py-10">
          <SectionHeading
            title="What students said"
            description="Reviews left by students after a completed session."
          />
          <ul className="grid gap-4 md:grid-cols-3">
            {socialProof.map(({ review, tutor }) => (
              <Card key={review.id} as="li" className="list-none">
                <CardBody className="flex h-full flex-col gap-3">
                  <Rating value={review.rating} count={1} showCount={false} />
                  <blockquote className="user-text flex-1 text-sm leading-relaxed text-ink-800">
                    “{review.comment}”
                  </blockquote>
                  <footer className="text-sm text-ink-500">
                    {/* The reviewer's name is not exposed on public review data, so
                        they are described accurately rather than given a fake name. */}
                    Verified student · on{' '}
                    <Link
                      to={`/tutors/${tutor.tutorProfile.id}`}
                      className="font-medium text-primary-700 underline-offset-2 hover:underline"
                    >
                      {tutor.user.displayName}
                    </Link>
                  </footer>
                </CardBody>
              </Card>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ===================== CLOSING ACTION ===================== */}
      <section className="container-page pb-12">
        <div className="flex flex-col gap-4 rounded-2xl border border-ink-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl">
              {isAuthenticated ? 'Ready for your next session?' : 'Ready to get started?'}
            </h2>
            <p className="mt-1 text-ink-600">
              {isTutor
                ? 'Publish availability so students can book you, or find a tutor for your own studies.'
                : 'Browse tutors by subject and see who is free this week.'}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <ButtonLink to="/tutors">Find a tutor</ButtonLink>
            {isTutor ? (
              <ButtonLink to="/dashboard/availability" variant="secondary">
                Manage availability
              </ButtonLink>
            ) : (
              <ButtonLink
                to={isAuthenticated ? '/dashboard/profile' : '/register'}
                variant="secondary"
              >
                Become a tutor
              </ButtonLink>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
