import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { SUBJECTS, subjectsByCategory } from '../../../shared/domain/subjects';
import { pluralise } from '../../lib/utils';
import { AdminPageHeader } from '../../components/admin/AdminLayout';
import {
  Badge,
  Card,
  CardBody,
  ErrorState,
  ListSkeleton,
} from '../../components/ui/primitives';

/**
 * Subject catalogue, read-only — and this is a design decision, not an omission.
 *
 * Subjects are a fixed vocabulary defined in `shared/domain/subjects.ts`, not rows in
 * a table. That is what makes search work: free-text subjects would produce "Maths",
 * "maths" and "Mathematics" as three unrelated things that no filter can reconcile.
 *
 * Adding create/edit/delete here would mean moving the catalogue into DynamoDB, which
 * needs a new table (a CloudFormation change) and a migration for every tutor profile
 * and session that references a subject id. Renaming or deleting a subject would also
 * silently orphan existing profiles. That is a real feature with real risk, not a
 * screen, so it is not being faked with buttons that do nothing.
 *
 * What this page does give an administrator is the useful part: which subjects are
 * actually covered, and which have no tutors at all.
 */
export function AdminSubjectsPage() {
  const { data, loading, error, reload } = useAsync(() => api.listTutorListings(), []);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const listing of data ?? []) {
      for (const id of listing.subjectIds) {
        map.set(id, (map.get(id) ?? 0) + 1);
      }
    }
    return map;
  }, [data]);

  const covered = counts.size;
  const uncovered = SUBJECTS.length - covered;

  return (
    <div>
      <AdminPageHeader
        title="Subjects"
        description={`${SUBJECTS.length} subjects in the catalogue. Read-only.`}
      />

      <Card className="mb-4">
        <CardBody>
          <p className="text-sm text-ink-700">
            The catalogue is a fixed, controlled vocabulary defined in the application
            source, not a database table. Keeping it fixed is what allows subject
            filtering to work reliably, and it means a subject can never be renamed out
            from under a tutor profile that references it.
          </p>
          {!loading && !error ? (
            <p className="mt-2 text-sm text-ink-600">
              <span className="font-semibold text-ink-900">{covered}</span> covered by at
              least one tutor ·{' '}
              <span className="font-semibold text-ink-900">{uncovered}</span> with no
              tutors yet
            </p>
          ) : null}
        </CardBody>
      </Card>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="space-y-5">
          {subjectsByCategory().map((group) => (
            <section key={group.category}>
              <h2 className="mb-2 text-sm font-semibold text-ink-700">
                {group.category}
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.subjects.map((subject) => {
                  const count = counts.get(subject.id) ?? 0;
                  return (
                    <li key={subject.id}>
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-ink-200 bg-white px-3.5 py-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink-900">
                            {subject.name}
                          </p>
                          <p className="truncate text-xs text-ink-500">
                            id: {subject.id}
                          </p>
                        </div>
                        {count > 0 ? (
                          <Link to={`/tutors?subject=${subject.id}`} className="shrink-0">
                            <Badge tone="primary">
                              {count} {pluralise(count, 'tutor')}
                            </Badge>
                          </Link>
                        ) : (
                          <Badge>None</Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
