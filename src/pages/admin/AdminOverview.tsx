import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { AdminPageHeader } from '../../components/admin/AdminLayout';
import {
  Card,
  CardBody,
  ErrorState,
  Skeleton,
} from '../../components/ui/primitives';

/**
 * Admin overview.
 *
 * Every figure is counted from real records by the server. Nothing is estimated,
 * rounded up, or filled in for visual effect. A zero is shown as a zero, because on
 * a new deployment that is the truth and pretending otherwise would make the whole
 * panel untrustworthy.
 */

function StatCard({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value: number | string | null;
  hint?: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardBody className="p-4">
        <p className="text-sm text-ink-600">{label}</p>
        {loading ? (
          <Skeleton className="mt-1.5 h-7 w-14" />
        ) : (
          <p className="mt-0.5 text-2xl font-semibold tabular-nums text-ink-900">
            {value ?? '—'}
          </p>
        )}
        {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
      </CardBody>
    </Card>
  );
}

export function AdminOverviewPage() {
  const { data, loading, error, reload } = useAsync(() => api.adminGetOverview(), []);

  return (
    <div>
      <AdminPageHeader
        title="Overview"
        description="Live counts from the platform database."
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="people-heading">
            <h2 id="people-heading" className="mb-2 text-sm font-semibold text-ink-700">
              People
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <StatCard label="Total users" value={data?.totalUsers ?? null} loading={loading} />
              <StatCard label="Learners" value={data?.students ?? null} loading={loading} />
              <StatCard label="Tutors" value={data?.tutors ?? null} loading={loading} />
              <StatCard
                label="Administrators"
                value={data?.admins ?? null}
                loading={loading}
              />
              <StatCard
                label="Suspended"
                value={data?.suspended ?? null}
                loading={loading}
              />
            </div>
          </section>

          <section aria-labelledby="tutors-heading">
            <h2 id="tutors-heading" className="mb-2 text-sm font-semibold text-ink-700">
              Tutor profiles
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Discoverable"
                value={data?.publishedTutors ?? null}
                hint="Published, with a subject and a bio"
                loading={loading}
              />
              <StatCard
                label="Not published"
                value={data?.unpublishedTutors ?? null}
                loading={loading}
              />
              <StatCard
                label="Open slots"
                value={data?.openSlots ?? null}
                hint="Upcoming and unbooked"
                loading={loading}
              />
              <StatCard
                label="Average rating"
                value={
                  loading
                    ? null
                    : data?.averageRating === null || data?.averageRating === undefined
                      ? 'No reviews'
                      : data.averageRating.toFixed(1)
                }
                hint="Across all reviews"
                loading={loading}
              />
            </div>
          </section>

          <section aria-labelledby="sessions-heading">
            <h2 id="sessions-heading" className="mb-2 text-sm font-semibold text-ink-700">
              Sessions
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <StatCard label="Total" value={data?.totalSessions ?? null} loading={loading} />
              <StatCard
                label="Awaiting reply"
                value={data?.pendingSessions ?? null}
                loading={loading}
              />
              <StatCard
                label="Confirmed"
                value={data?.confirmedSessions ?? null}
                loading={loading}
              />
              <StatCard
                label="Upcoming"
                value={data?.upcomingSessions ?? null}
                loading={loading}
              />
              <StatCard
                label="Completed"
                value={data?.completedSessions ?? null}
                loading={loading}
              />
              <StatCard
                label="Cancelled"
                value={data?.cancelledSessions ?? null}
                loading={loading}
              />
            </div>
          </section>

          <section aria-labelledby="reviews-heading">
            <h2 id="reviews-heading" className="mb-2 text-sm font-semibold text-ink-700">
              Reviews
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Total reviews"
                value={data?.totalReviews ?? null}
                loading={loading}
              />
              <StatCard
                label="Declined requests"
                value={data?.declinedSessions ?? null}
                loading={loading}
              />
            </div>
          </section>

          <Card>
            <CardBody>
              <h2 className="text-base">Common tasks</h2>
              <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {[
                  { to: '/admin/users', label: 'Manage users' },
                  { to: '/admin/tutors', label: 'Review tutor profiles' },
                  { to: '/admin/sessions', label: 'Inspect sessions' },
                  { to: '/admin/reviews', label: 'Moderate reviews' },
                ].map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className="font-medium text-primary-700 underline-offset-2 hover:underline"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
