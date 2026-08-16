import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { toUserMessage } from '../../../shared/domain/errors';
import { getSubjectName } from '../../../shared/domain/subjects';
import { formatRatePerHour, pluralise } from '../../lib/utils';
import { useToast } from '../../context/ToastContext';
import { AdminPageHeader } from '../../components/admin/AdminLayout';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { ConfirmDialog } from '../../components/ui/Modal';
import {
  Avatar,
  Badge,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Rating,
} from '../../components/ui/primitives';
import { BookIcon, SearchIcon } from '../../components/ui/icons';

/**
 * Tutor oversight.
 *
 * There is no approval workflow, because the platform does not have one: tutors
 * publish themselves. Inventing an approval queue would mean adding a state that
 * nothing else in the system understands. What an administrator can do is the
 * moderation action the data actually supports — take a profile out of search.
 */
export function AdminTutorsPage() {
  const toast = useToast();
  const usersState = useAsync(() => api.adminListUsers(), []);
  const listingsState = useAsync(() => api.listTutorListings(), []);

  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState('ALL');
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);

  const tutors = useMemo(() => {
    const listingByProfile = new Map(
      (listingsState.data ?? []).map((listing) => [listing.tutorProfile.id, listing]),
    );

    return (usersState.data ?? [])
      .filter((user) => user.tutorProfileId !== null)
      .map((user) => ({
        user,
        listing: user.tutorProfileId
          ? listingByProfile.get(user.tutorProfileId) ?? null
          : null,
      }))
      .filter((row) => {
        if (visibility === 'PUBLISHED' && !row.user.isPublishedTutor) return false;
        if (visibility === 'HIDDEN' && row.user.isPublishedTutor) return false;
        const needle = query.trim().toLowerCase();
        if (!needle) return true;
        return `${row.user.displayName} ${row.user.email}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => b.user.ratingCount - a.user.ratingCount);
  }, [usersState.data, listingsState.data, query, visibility]);

  const loading = usersState.loading || listingsState.loading;
  const error = usersState.error ?? listingsState.error;

  async function unpublish(profileId: string) {
    setBusy(true);
    try {
      await api.adminUnpublishTutor(profileId);
      usersState.reload();
      listingsState.reload();
      toast.success('Tutor profile removed from search.');
      setTarget(null);
    } catch (caught) {
      toast.error(toUserMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="Tutors"
        description={
          loading
            ? 'Loading tutor profiles…'
            : `${tutors.length} tutor ${pluralise(tutors.length, 'profile')} shown.`
        }
      />

      <Card className="mb-4">
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Search"
            type="search"
            placeholder="Tutor name or email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            leadingIcon={<SearchIcon />}
          />
          <Select
            label="Visibility"
            value={visibility}
            onChange={(event) => setVisibility(event.target.value)}
            options={[
              { value: 'ALL', label: 'All tutor profiles' },
              { value: 'PUBLISHED', label: 'Discoverable in search' },
              { value: 'HIDDEN', label: 'Not published' },
            ]}
          />
        </CardBody>
      </Card>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            usersState.reload();
            listingsState.reload();
          }}
        />
      ) : tutors.length === 0 ? (
        <EmptyState
          icon={<BookIcon />}
          title="No tutor profiles match"
          description="Nobody has created a tutor profile yet, or your filters exclude them all."
        />
      ) : (
        <ul className="space-y-3">
          {tutors.map(({ user, listing }) => (
            <Card key={user.id} as="li" className="list-none">
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <Avatar name={user.displayName} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink-900">
                        {user.displayName}
                      </p>
                      <p className="break-all text-sm text-ink-600">{user.email}</p>
                      {user.institution ? (
                        <p className="truncate text-xs text-ink-500">{user.institution}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {user.status === 'SUSPENDED' ? (
                      <Badge tone="danger">Suspended</Badge>
                    ) : null}
                    {user.isPublishedTutor ? (
                      <Badge tone="success">In search</Badge>
                    ) : (
                      <Badge tone="pending">Not published</Badge>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <Rating value={user.ratingAvg} count={user.ratingCount} />
                  {listing ? (
                    <>
                      <span className="text-ink-700">
                        {formatRatePerHour(
                          listing.tutorProfile.hourlyRate,
                          listing.tutorProfile.currency,
                        )}
                      </span>
                      <span className="text-ink-700">
                        {listing.openSlotCount} open{' '}
                        {pluralise(listing.openSlotCount, 'slot')}
                      </span>
                    </>
                  ) : null}
                </div>

                {listing ? (
                  <>
                    <p className="user-text text-sm text-ink-700">
                      {listing.tutorProfile.headline}
                    </p>
                    <ul className="flex flex-wrap gap-1.5">
                      {listing.subjectIds.map((subjectId) => (
                        <li key={subjectId}>
                          <Badge tone="primary">{getSubjectName(subjectId)}</Badge>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-ink-500">
                    This profile is not published, so its public details are not loaded
                    here. Open the user in Users to see them.
                  </p>
                )}

                <div className="flex flex-wrap gap-2 border-t border-ink-200 pt-3">
                  {listing ? (
                    <Link
                      to={`/tutors/${listing.tutorProfile.id}`}
                      className="inline-flex h-9 items-center rounded-lg border border-ink-300 bg-white px-3 text-sm font-medium text-ink-800 hover:bg-ink-50"
                    >
                      View public profile
                    </Link>
                  ) : null}
                  {user.isPublishedTutor && user.tutorProfileId ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        setTarget({ id: user.tutorProfileId!, name: user.displayName })
                      }
                      className="text-rose-700"
                    >
                      Remove from search
                    </Button>
                  ) : null}
                </div>
              </CardBody>
            </Card>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        busy={busy}
        danger
        title="Remove this profile from search?"
        confirmLabel="Remove from search"
        message={
          target
            ? `${target.name} will no longer appear to students. Their account, existing sessions and reviews are untouched, and they can publish again themselves.`
            : ''
        }
        onConfirm={() => target && void unpublish(target.id)}
      />
    </div>
  );
}
