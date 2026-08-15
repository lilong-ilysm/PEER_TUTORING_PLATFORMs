import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { formatLongDate, formatSlotRange, pluralise } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { ButtonLink } from '../../components/ui/Button';
import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  ListSkeleton,
  SectionHeading,
  SessionStatusBadge,
} from '../../components/ui/primitives';
import { AlertIcon, CalendarIcon, ClockIcon } from '../../components/ui/icons';

/**
 * Dashboard overview.
 *
 * Ordered by what needs action, not by what is easiest to render. A tutor with
 * three pending requests should see those first; everything else can wait.
 */
export function DashboardOverviewPage() {
  const { user, isTutor, tutorProfile, hasPublishedTutorProfile } = useAuth();

  const sessionsState = useAsync(() => api.listMySessions(), []);
  const slotsState = useAsync(
    () => (isTutor ? api.listMySlots() : Promise.resolve([])),
    [isTutor],
  );

  const sessions = sessionsState.data ?? [];
  const userId = user?.userId ?? '';

  const grouped = useMemo(() => {
    const now = Date.now();
    return {
      incomingRequests: sessions.filter(
        (session) => session.status === 'PENDING' && session.tutorUserId === userId,
      ),
      awaitingReply: sessions.filter(
        (session) => session.status === 'PENDING' && session.studentUserId === userId,
      ),
      upcoming: sessions
        .filter(
          (session) =>
            session.status === 'CONFIRMED' && Date.parse(session.endAt) >= now,
        )
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
      toComplete: sessions.filter(
        (session) =>
          session.status === 'CONFIRMED' &&
          session.tutorUserId === userId &&
          Date.parse(session.startAt) < now,
      ),
      toReview: sessions.filter(
        (session) =>
          session.status === 'COMPLETED' &&
          session.studentUserId === userId &&
          !session.hasReview,
      ),
      completedCount: sessions.filter((session) => session.status === 'COMPLETED').length,
    };
  }, [sessions, userId]);

  const openSlots = (slotsState.data ?? []).filter(
    (slot) => slot.status === 'OPEN' && Date.parse(slot.startAt) > Date.now(),
  );

  const actionItems = [
    grouped.incomingRequests.length > 0
      ? {
          key: 'requests',
          text: `${grouped.incomingRequests.length} ${pluralise(grouped.incomingRequests.length, 'request')} waiting for your response`,
          to: '/dashboard/sessions?filter=requests',
          cta: 'Review requests',
        }
      : null,
    grouped.toComplete.length > 0
      ? {
          key: 'complete',
          text: `${grouped.toComplete.length} ${pluralise(grouped.toComplete.length, 'session')} ready to mark complete`,
          to: '/dashboard/sessions',
          cta: 'Mark complete',
        }
      : null,
    grouped.toReview.length > 0
      ? {
          key: 'review',
          text: `${grouped.toReview.length} completed ${pluralise(grouped.toReview.length, 'session')} you can review`,
          to: '/dashboard/sessions',
          cta: 'Leave a review',
        }
      : null,
    isTutor && !hasPublishedTutorProfile
      ? {
          key: 'profile',
          text: tutorProfile
            ? 'Your tutor profile is not published, so students cannot find you'
            : 'Create your tutor profile so students can find you',
          to: '/dashboard/profile',
          cta: 'Finish profile',
        }
      : null,
    isTutor && hasPublishedTutorProfile && openSlots.length === 0
      ? {
          key: 'availability',
          text: 'You have no upcoming availability, so nobody can book you',
          to: '/dashboard/availability',
          cta: 'Add times',
        }
      : null,
  ].filter(Boolean) as { key: string; text: string; to: string; cta: string }[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl">
          {user?.displayName ? `Hello, ${user.displayName.split(' ')[0]}` : 'Dashboard'}
        </h1>
        <p className="mt-1 text-ink-600">
          {isTutor
            ? 'Your requests, sessions and availability in one place.'
            : 'Your sessions and requests in one place.'}
        </p>
      </div>

      {/* --- Needs attention. Amber only, and only when it is true. --- */}
      {actionItems.length > 0 ? (
        <section aria-labelledby="attention-heading">
          <h2 id="attention-heading" className="mb-3 flex items-center gap-2 text-lg">
            <span className="text-amber-600" aria-hidden="true">
              <AlertIcon />
            </span>
            Needs your attention
          </h2>
          <ul className="space-y-2">
            {actionItems.map((item) => (
              <li key={item.key}>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5">
                  <p className="min-w-0 flex-1 text-amber-950">{item.text}</p>
                  <Link
                    to={item.to}
                    className="shrink-0 rounded-lg bg-amber-900 px-3 py-2 text-sm font-medium text-white hover:bg-amber-950"
                  >
                    {item.cta}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* --- Counts, all derived from real records. --- */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          Summary
        </h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Upcoming', value: grouped.upcoming.length },
            { label: 'Completed', value: grouped.completedCount },
            {
              label: isTutor ? 'Open requests' : 'Awaiting reply',
              value: isTutor
                ? grouped.incomingRequests.length
                : grouped.awaitingReply.length,
            },
            ...(isTutor
              ? [{ label: 'Open times', value: openSlots.length }]
              : [{ label: 'To review', value: grouped.toReview.length }]),
          ].map((stat) => (
            <Card key={stat.label}>
              <CardBody className="p-4">
                <dt className="text-sm text-ink-600">{stat.label}</dt>
                <dd className="mt-0.5 text-2xl font-semibold text-ink-900">
                  {sessionsState.loading ? '—' : stat.value}
                </dd>
              </CardBody>
            </Card>
          ))}
        </dl>
      </section>

      {/* --- Next sessions --- */}
      <section aria-labelledby="upcoming-heading">
        <SectionHeading
          title="Next sessions"
          id="upcoming-heading"
          action={
            <Link
              to="/dashboard/sessions"
              className="text-sm font-medium text-primary-700 underline-offset-2 hover:underline"
            >
              All sessions
            </Link>
          }
        />

        {sessionsState.loading ? (
          <ListSkeleton rows={2} />
        ) : sessionsState.error ? (
          <ErrorState message={sessionsState.error} onRetry={sessionsState.reload} />
        ) : grouped.upcoming.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon />}
            title="Nothing scheduled"
            description={
              isTutor
                ? 'When a student books one of your published times and you accept, it will appear here.'
                : 'Find a tutor and request a time to get started.'
            }
            action={<ButtonLink to="/tutors">Find a tutor</ButtonLink>}
          />
        ) : (
          <ul className="space-y-3">
            {grouped.upcoming.slice(0, 4).map((session) => {
              const isTutorView = session.tutorUserId === userId;
              return (
                <Card key={session.id} as="li" className="list-none">
                  <CardBody className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900">
                        {isTutorView ? session.studentName : session.tutorName}
                        <span className="font-normal text-ink-500">
                          {' '}
                          · {isTutorView ? 'learner' : 'tutor'}
                        </span>
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-600">
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden="true">
                            <ClockIcon />
                          </span>
                          {formatLongDate(session.startAt)}
                        </span>
                        <span>{formatSlotRange(session.startAt, session.endAt)}</span>
                      </p>
                      <p className="user-text mt-1 text-sm text-ink-700">{session.topic}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <SessionStatusBadge status={session.status} />
                      <Link
                        to={`/dashboard/messages?session=${session.id}`}
                        className="text-sm font-medium text-primary-700 underline-offset-2 hover:underline"
                      >
                        Messages
                      </Link>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </ul>
        )}
      </section>

      {/* --- Tutor-only quick links --- */}
      {isTutor ? (
        <section aria-labelledby="tutor-heading">
          <SectionHeading title="Your tutoring" id="tutor-heading" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardBody>
                <h3 className="text-base">Availability</h3>
                <p className="mt-1 text-sm text-ink-600">
                  {slotsState.loading
                    ? 'Loading…'
                    : openSlots.length > 0
                      ? `${openSlots.length} open ${pluralise(openSlots.length, 'time')} published`
                      : 'No upcoming times published'}
                </p>
                <ButtonLink
                  to="/dashboard/availability"
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                >
                  Manage availability
                </ButtonLink>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <h3 className="text-base">Your public profile</h3>
                <div className="mt-1.5">
                  {hasPublishedTutorProfile ? (
                    <Badge tone="success">Published and discoverable</Badge>
                  ) : (
                    <Badge tone="pending">Not visible to students</Badge>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ButtonLink to="/dashboard/profile" variant="secondary" size="sm">
                    Edit profile
                  </ButtonLink>
                  {tutorProfile ? (
                    <ButtonLink
                      to={`/tutors/${tutorProfile.id}`}
                      variant="ghost"
                      size="sm"
                    >
                      View as student
                    </ButtonLink>
                  ) : null}
                </div>
              </CardBody>
            </Card>
          </div>
        </section>
      ) : null}
    </div>
  );
}
