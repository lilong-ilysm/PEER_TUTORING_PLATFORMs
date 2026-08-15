import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { subjectsByCategory } from '../../shared/domain/subjects';
import { pluralise } from '../lib/utils';
import { Card, CardBody, ErrorState, ListSkeleton } from '../components/ui/primitives';

/**
 * Subject directory.
 *
 * Counts are computed from real tutor profiles. A subject with no tutors says so
 * plainly rather than being hidden, because "nobody covers this yet" is useful
 * information for someone deciding whether to become a tutor.
 */
export function SubjectsPage() {
  const { data: listings, loading, error, reload } = useAsync(
    () => api.listTutorListings(),
    [],
  );

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const listing of listings ?? []) {
      for (const id of listing.subjectIds) {
        map.set(id, (map.get(id) ?? 0) + 1);
      }
    }
    return map;
  }, [listings]);

  const groups = subjectsByCategory();

  return (
    <div className="container-page py-6 lg:py-8">
      <h1 className="text-2xl sm:text-3xl">Subjects</h1>
      <p className="mt-1.5 max-w-2xl text-ink-600">
        Every subject on the platform, with the number of tutors currently offering it.
      </p>

      {loading ? (
        <div className="mt-6">
          <ListSkeleton rows={4} />
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map((group) => (
            <section key={group.category} aria-labelledby={`category-${group.category}`}>
              <h2
                id={`category-${group.category}`}
                className="mb-3 text-lg"
              >
                {group.category}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.subjects.map((subject) => {
                  const count = counts.get(subject.id) ?? 0;
                  return (
                    <Card key={subject.id} as="li" className="list-none">
                      <CardBody className="flex items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-medium">
                            {count > 0 ? (
                              <Link
                                to={`/tutors?subject=${subject.id}`}
                                className="underline-offset-2 hover:underline"
                              >
                                {subject.name}
                              </Link>
                            ) : (
                              subject.name
                            )}
                          </h3>
                          <p className="text-sm text-ink-500">
                            {count > 0
                              ? `${count} ${pluralise(count, 'tutor')}`
                              : 'No tutors yet'}
                          </p>
                        </div>
                        {count > 0 ? (
                          <Link
                            to={`/tutors?subject=${subject.id}`}
                            className="shrink-0 text-sm font-medium text-primary-700 underline-offset-2 hover:underline"
                            aria-label={`Browse ${subject.name} tutors`}
                          >
                            Browse
                          </Link>
                        ) : null}
                      </CardBody>
                    </Card>
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
