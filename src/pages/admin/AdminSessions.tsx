import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import type { SessionStatus } from '../../../shared/domain/types';
import { formatDate, formatSlotRange, pluralise } from '../../lib/utils';
import { AdminPageHeader } from '../../components/admin/AdminLayout';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import {
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  ListSkeleton,
  SessionStatusBadge,
} from '../../components/ui/primitives';
import { CalendarIcon, SearchIcon } from '../../components/ui/icons';

/**
 * Session oversight, read-only.
 *
 * Administrators can inspect every session but not change its state. Accepting or
 * completing on a tutor's behalf would put a record in the database that neither
 * participant agreed to, and reviews depend on completion being genuine. The status
 * values here are the platform's real ones, not an admin-specific vocabulary.
 */

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'PENDING', label: 'Awaiting reply' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'DECLINED', label: 'Declined' },
];

export function AdminSessionsPage() {
  const { data, loading, error, reload } = useAsync(() => api.adminListSessions(), []);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');

  const sessions = data ?? [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sessions.filter((session) => {
      if (status !== 'ALL' && session.status !== (status as SessionStatus)) return false;
      if (!needle) return true;
      return `${session.studentName} ${session.tutorName} ${session.subjectName} ${session.topic}`
        .toLowerCase()
        .includes(needle);
    });
  }, [sessions, query, status]);

  return (
    <div>
      <AdminPageHeader
        title="Sessions"
        description={
          loading
            ? 'Loading sessions…'
            : `${sessions.length} ${pluralise(sessions.length, 'session')} on the platform. Read-only.`
        }
      />

      <Card className="mb-4">
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Search"
            type="search"
            placeholder="Student, tutor, subject or topic"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            leadingIcon={<SearchIcon />}
          />
          <Select
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={STATUS_OPTIONS}
          />
        </CardBody>
      </Card>

      <p className="mb-3 text-sm text-ink-600" aria-live="polite">
        {loading ? 'Searching…' : `Showing ${filtered.length} of ${sessions.length}`}
      </p>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon />}
          title="No sessions match these filters"
          description="No session has been requested yet, or your filters exclude them all."
          action={
            status !== 'ALL' || query ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('');
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
          <div className="hidden overflow-hidden rounded-xl border border-ink-200 bg-white lg:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">All tutoring sessions</caption>
              <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-600">
                <tr>
                  {['Student', 'Tutor', 'Subject', 'Date', 'Time', 'Status'].map((head) => (
                    <th key={head} scope="col" className="px-4 py-2.5 font-semibold">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {filtered.map((session) => (
                  <tr key={session.id} className="hover:bg-ink-50">
                    <td className="px-4 py-3 text-ink-900">{session.studentName}</td>
                    <td className="px-4 py-3 text-ink-900">{session.tutorName}</td>
                    <td className="px-4 py-3 text-ink-700">{session.subjectName}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-700">
                      {formatDate(session.startAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-700">
                      {formatSlotRange(session.startAt, session.endAt)}
                    </td>
                    <td className="px-4 py-3">
                      <SessionStatusBadge status={session.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 lg:hidden">
            {filtered.map((session) => (
              <Card key={session.id} as="li" className="list-none">
                <CardBody className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 font-medium text-ink-900">
                      {session.studentName}
                      <span className="font-normal text-ink-500"> with </span>
                      {session.tutorName}
                    </p>
                    <SessionStatusBadge status={session.status} />
                  </div>
                  <p className="text-sm text-ink-700">{session.subjectName}</p>
                  <p className="text-sm text-ink-600">
                    {formatDate(session.startAt)} ·{' '}
                    <span className="whitespace-nowrap tabular-nums">
                      {formatSlotRange(session.startAt, session.endAt)}
                    </span>
                  </p>
                  <p className="user-text text-sm text-ink-700">{session.topic}</p>
                </CardBody>
              </Card>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
