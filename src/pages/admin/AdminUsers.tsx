import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { toUserMessage } from '../../../shared/domain/errors';
import { ROLE_LABELS } from '../../../shared/domain/subjects';
import type {
  AccountStatus,
  AdminUserDetail,
  AdminUserSummary,
  UserRole,
} from '../../../shared/domain/types';
import { formatDate, pluralise } from '../../lib/utils';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { AdminPageHeader } from '../../components/admin/AdminLayout';
import { Button } from '../../components/ui/Button';
import { Input, Select, ToggleChip } from '../../components/ui/Field';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
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
import { SearchIcon, UserIcon } from '../../components/ui/icons';

/**
 * User management.
 *
 * Shows email, role, status, registration date and activity. It does NOT show, and
 * cannot show, passwords or password hashes: on AWS those live inside Cognito and are
 * never sent to the application, and in demo mode they are salted hashes that this
 * screen never reads. There is no endpoint that returns them.
 *
 * Not shown, because the data genuinely is not available: email verification status
 * and last sign-in. Both live in Cognito and reading them needs
 * `cognito-idp:AdminGetUser`, which cannot be relied on in a restricted lab account.
 * Rather than display an empty or invented column, they are omitted.
 */

const ROLE_FILTERS = [
  { value: 'ALL', label: 'All roles' },
  { value: 'STUDENT', label: 'Learners' },
  { value: 'TUTOR', label: 'Tutors' },
  { value: 'ADMIN', label: 'Administrators' },
];

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

const SORTS = [
  { value: 'NEWEST', label: 'Newest first' },
  { value: 'NAME', label: 'Name A–Z' },
  { value: 'SESSIONS', label: 'Most sessions' },
];

function StatusBadge({ status }: { status: AccountStatus }) {
  return status === 'SUSPENDED' ? (
    <Badge tone="danger">Suspended</Badge>
  ) : (
    <Badge tone="success">Active</Badge>
  );
}

function RoleBadges({ roles }: { roles: UserRole[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <Badge key={role} tone={role === 'ADMIN' ? 'danger' : 'primary'}>
          {role === 'ADMIN' ? 'Admin' : ROLE_LABELS[role]}
        </Badge>
      ))}
    </span>
  );
}

export function AdminUsersPage() {
  const toast = useToast();
  const { user: currentUser } = useAuth();
  const usersState = useAsync(() => api.adminListUsers(), []);

  const [query, setQuery] = useState('');
  const [role, setRole] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [sort, setSort] = useState('NEWEST');

  const [selected, setSelected] = useState<AdminUserDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<AdminUserSummary | null>(null);
  const [draftRoles, setDraftRoles] = useState<UserRole[]>([]);

  const users = usersState.data ?? [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const result = users.filter((candidate) => {
      if (role !== 'ALL' && !candidate.roles.includes(role as UserRole)) return false;
      if (status !== 'ALL' && candidate.status !== status) return false;
      if (needle) {
        const haystack = `${candidate.displayName} ${candidate.email} ${
          candidate.institution ?? ''
        }`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });

    switch (sort) {
      case 'NAME':
        return [...result].sort((a, b) => a.displayName.localeCompare(b.displayName));
      case 'SESSIONS':
        return [...result].sort((a, b) => b.sessionCount - a.sessionCount);
      default:
        return [...result].sort(
          (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
        );
    }
  }, [users, query, role, status, sort]);

  async function openDetail(summary: AdminUserSummary) {
    setLoadingDetail(true);
    try {
      const detail = await api.adminGetUser(summary.id);
      setSelected(detail);
      setDraftRoles(detail.roles);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setLoadingDetail(false);
    }
  }

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      usersState.reload();
      toast.success(message);
      return true;
    } catch (error) {
      toast.error(toUserMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const activeFilters =
    (query.trim() ? 1 : 0) + (role !== 'ALL' ? 1 : 0) + (status !== 'ALL' ? 1 : 0);

  return (
    <div>
      <AdminPageHeader
        title="Users"
        description={
          usersState.loading
            ? 'Loading accounts…'
            : `${users.length} ${pluralise(users.length, 'account')} registered.`
        }
      />

      {/* Filters */}
      <Card className="mb-4">
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Search"
            type="search"
            placeholder="Name, email or institution"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            leadingIcon={<SearchIcon />}
          />
          <Select
            label="Role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            options={ROLE_FILTERS}
          />
          <Select
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={STATUS_FILTERS}
          />
          <Select
            label="Sort"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            options={SORTS}
          />
        </CardBody>
      </Card>

      <p className="mb-3 text-sm text-ink-600" aria-live="polite">
        {usersState.loading
          ? 'Searching…'
          : `Showing ${filtered.length} of ${users.length}`}
      </p>

      {usersState.loading ? (
        <ListSkeleton rows={4} />
      ) : usersState.error ? (
        <ErrorState message={usersState.error} onRetry={usersState.reload} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<UserIcon />}
          title="No users match these filters"
          description={
            activeFilters > 0
              ? 'Try clearing the search box or widening the role and status filters.'
              : 'No accounts have been registered yet.'
          }
          action={
            activeFilters > 0 ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('');
                  setRole('ALL');
                  setStatus('ALL');
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop: real table. Admin work is comparison work, and a table is the
              right tool for it. */}
          <div className="hidden overflow-hidden rounded-xl border border-ink-200 bg-white lg:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Registered user accounts</caption>
              <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-600">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Roles
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Registered
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Sessions
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {filtered.map((candidate) => (
                  <tr key={candidate.id} className="hover:bg-ink-50">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={candidate.displayName} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink-900">
                            {candidate.displayName}
                            {candidate.userId === currentUser?.userId ? (
                              <span className="ml-1.5 text-xs text-ink-500">(you)</span>
                            ) : null}
                          </span>
                          {candidate.institution ? (
                            <span className="block truncate text-xs text-ink-500">
                              {candidate.institution}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="break-all text-ink-700">{candidate.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadges roles={candidate.roles} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={candidate.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-700">
                      {formatDate(candidate.createdAt)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink-700">
                      {candidate.sessionCount}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void openDetail(candidate)}
                        disabled={loadingDetail}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards. A seven-column table at 375px would force horizontal
              scrolling, which is exactly what the brief rules out. */}
          <ul className="space-y-3 lg:hidden">
            {filtered.map((candidate) => (
              <Card key={candidate.id} as="li" className="list-none">
                <CardBody className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Avatar name={candidate.displayName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink-900">
                        {candidate.displayName}
                      </p>
                      <p className="break-all text-sm text-ink-600">{candidate.email}</p>
                    </div>
                    <StatusBadge status={candidate.status} />
                  </div>

                  <RoleBadges roles={candidate.roles} />

                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-ink-500">Registered</dt>
                      <dd className="text-ink-800">{formatDate(candidate.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-500">Sessions</dt>
                      <dd className="tabular-nums text-ink-800">{candidate.sessionCount}</dd>
                    </div>
                  </dl>

                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={() => void openDetail(candidate)}
                    disabled={loadingDetail}
                  >
                    View details
                  </Button>
                </CardBody>
              </Card>
            ))}
          </ul>
        </>
      )}

      {/* --- User detail --- */}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.displayName ?? 'User'}
        description={selected?.email}
        size="lg"
        busy={busy}
      >
        {selected ? (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                { term: 'User ID', detail: selected.userId },
                { term: 'Registered', detail: formatDate(selected.createdAt) },
                { term: 'Institution', detail: selected.institution || 'Not given' },
                {
                  term: 'Sessions',
                  detail: `${selected.sessionsAsStudent} as learner, ${selected.sessionsAsTutor} as tutor`,
                },
                { term: 'Reviews written', detail: String(selected.reviewsWritten) },
                { term: 'Reviews received', detail: String(selected.reviewsReceived) },
              ].map((row) => (
                <div key={row.term} className="min-w-0">
                  <dt className="text-ink-500">{row.term}</dt>
                  <dd className="break-all text-ink-900">{row.detail}</dd>
                </div>
              ))}
            </dl>

            {selected.bio ? (
              <div>
                <h3 className="text-sm font-semibold text-ink-700">About</h3>
                <p className="user-text mt-1 text-sm text-ink-800">{selected.bio}</p>
              </div>
            ) : null}

            {selected.tutorProfile ? (
              <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink-700">Tutor profile</h3>
                  {selected.isPublishedTutor ? (
                    <Badge tone="success">Discoverable</Badge>
                  ) : (
                    <Badge tone="pending">Not published</Badge>
                  )}
                </div>
                <p className="user-text mt-2 text-sm text-ink-800">
                  {selected.tutorProfile.headline}
                </p>
                <div className="mt-2">
                  <Rating
                    value={selected.ratingAvg}
                    count={selected.ratingCount}
                  />
                </div>
                {selected.isPublishedTutor ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    disabled={busy}
                    onClick={async () => {
                      const ok = await run(
                        () => api.adminUnpublishTutor(selected.tutorProfile!.id),
                        'Tutor profile removed from search.',
                      );
                      if (ok) await openDetail(selected);
                    }}
                  >
                    Remove from search
                  </Button>
                ) : null}
              </div>
            ) : null}

            {/* Roles */}
            <div>
              <h3 className="text-sm font-semibold text-ink-700">Roles</h3>
              <p className="mt-1 text-xs text-ink-500">
                Granting Admin gives full access to this panel. Applied by the server
                after re-checking your own administrator role.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(['STUDENT', 'TUTOR', 'ADMIN'] as UserRole[]).map((candidate) => (
                  <ToggleChip
                    key={candidate}
                    selected={draftRoles.includes(candidate)}
                    onToggle={() =>
                      setDraftRoles((current) =>
                        current.includes(candidate)
                          ? current.filter((item) => item !== candidate)
                          : [...current, candidate],
                      )
                    }
                  >
                    {candidate === 'ADMIN' ? 'Admin' : ROLE_LABELS[candidate]}
                  </ToggleChip>
                ))}
              </div>
              <Button
                size="sm"
                className="mt-3"
                loading={busy}
                disabled={
                  draftRoles.length === 0 ||
                  draftRoles.slice().sort().join() === selected.roles.slice().sort().join()
                }
                onClick={async () => {
                  const ok = await run(
                    () => api.adminSetUserRoles(selected.id, draftRoles),
                    'Roles updated.',
                  );
                  if (ok) await openDetail(selected);
                }}
              >
                Save roles
              </Button>
            </div>

            {/* Account status */}
            <div className="border-t border-ink-200 pt-4">
              <h3 className="text-sm font-semibold text-ink-700">Account status</h3>
              <p className="mt-1 text-xs text-ink-500">
                A suspended account cannot sign in or use the API, and a suspended tutor
                is removed from search.
              </p>
              <div className="mt-2">
                {selected.status === 'ACTIVE' ? (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      setSuspendTarget({
                        ...selected,
                      })
                    }
                  >
                    Suspend account
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    loading={busy}
                    onClick={async () => {
                      const ok = await run(
                        () => api.adminSetUserStatus(selected.id, 'ACTIVE'),
                        'Account reactivated.',
                      );
                      if (ok) await openDetail(selected);
                    }}
                  >
                    Reactivate account
                  </Button>
                )}
              </div>
            </div>

            <p className="rounded-lg bg-ink-50 p-3 text-xs text-ink-600">
              Passwords are held by the authentication system and are never readable by
              administrators. This panel has no access to them, and no endpoint returns
              them.
            </p>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(suspendTarget)}
        onClose={() => setSuspendTarget(null)}
        busy={busy}
        danger
        title="Suspend this account?"
        confirmLabel="Suspend account"
        message={
          suspendTarget
            ? `${suspendTarget.displayName} will be signed out of the API immediately and will not be able to sign in. If they are a tutor, their profile is removed from search. This can be undone.`
            : ''
        }
        onConfirm={async () => {
          if (!suspendTarget) return;
          const ok = await run(
            () => api.adminSetUserStatus(suspendTarget.id, 'SUSPENDED'),
            'Account suspended.',
          );
          if (ok) {
            setSuspendTarget(null);
            if (selected) await openDetail(selected);
          }
        }}
      />
    </div>
  );
}
