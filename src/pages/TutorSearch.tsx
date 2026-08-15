import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import {
  countActiveFilters,
  DEFAULT_PAGE_SIZE,
  searchTutors,
} from '../../shared/domain/search';
import type { AcademicLevel, SessionMode, SortKey, TutorSearchFilters } from '../../shared/domain/types';
import { pluralise } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { TutorCard } from '../components/tutors/TutorCard';
import { SORT_OPTIONS, TutorFilterFields } from '../components/tutors/TutorFilters';
import {
  EmptyState,
  ErrorState,
  Pagination,
  TutorCardSkeleton,
} from '../components/ui/primitives';
import { FilterIcon, SearchIcon } from '../components/ui/icons';

/**
 * Tutor search.
 *
 * Filter state lives in the URL rather than in component state (AC-12), so a
 * filtered result set can be reloaded, bookmarked and shared. The URL is the single
 * source of truth; there is no second copy to fall out of sync.
 */
export function TutorSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);

  const filters = useMemo<TutorSearchFilters>(() => {
    const number = (key: string) => {
      const raw = searchParams.get(key);
      if (raw === null || raw === '') return undefined;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    return {
      q: searchParams.get('q') ?? undefined,
      subjectId: searchParams.get('subject') ?? undefined,
      level: (searchParams.get('level') as AcademicLevel | null) ?? undefined,
      mode: (searchParams.get('mode') as SessionMode | null) ?? undefined,
      minRating: number('minRating'),
      maxRate: number('maxRate'),
      weekday: number('weekday'),
      sort: (searchParams.get('sort') as SortKey | null) ?? 'RATING_DESC',
      page: number('page') ?? 1,
      pageSize: DEFAULT_PAGE_SIZE,
    };
  }, [searchParams]);

  const { data: listings, loading, error, reload } = useAsync(
    () => api.listTutorListings(),
    [],
  );

  const updateFilters = useCallback(
    (next: Partial<TutorSearchFilters>) => {
      const params = new URLSearchParams(searchParams);
      const apply = (key: string, value: unknown) => {
        if (value === undefined || value === null || value === '') params.delete(key);
        else params.set(key, String(value));
      };

      if ('q' in next) apply('q', next.q);
      if ('subjectId' in next) apply('subject', next.subjectId);
      if ('level' in next) apply('level', next.level);
      if ('mode' in next) apply('mode', next.mode);
      if ('minRating' in next) apply('minRating', next.minRating);
      if ('maxRate' in next) apply('maxRate', next.maxRate);
      if ('weekday' in next) apply('weekday', next.weekday);
      if ('sort' in next) apply('sort', next.sort);
      if ('page' in next) apply('page', next.page === 1 ? undefined : next.page);

      // Any filter change resets pagination, or page 3 of the old result set
      // silently becomes an empty page 3 of the new one.
      if (!('page' in next)) params.delete('page');

      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const clearFilters = useCallback(() => {
    const params = new URLSearchParams();
    const sort = searchParams.get('sort');
    if (sort) params.set('sort', sort);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const activeCount = countActiveFilters(filters);
  const results = useMemo(
    () => (listings ? searchTutors(listings, filters) : null),
    [listings, filters],
  );

  const filterProps = {
    filters,
    onChange: updateFilters,
    onClear: clearFilters,
    activeCount,
  };

  return (
    <div className="container-page py-6 lg:py-8">
      <div className="mb-5">
        <h1 className="text-2xl sm:text-3xl">Find a tutor</h1>
        <p className="mt-1.5 text-ink-600">
          Filter by subject, level, session type, rate and the days you are free.
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
        {/* Persistent rail on desktop. */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-xl border border-ink-200 bg-white p-4">
            <h2 className="mb-3 text-base">Filters</h2>
            <TutorFilterFields {...filterProps} />
          </div>
        </aside>

        <div className="min-w-0">
          {/* Result count + sort + mobile filter trigger. */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <p
              // Announced so a screen-reader user learns the list changed.
              aria-live="polite"
              className="min-w-0 flex-1 text-sm text-ink-700"
            >
              {loading
                ? 'Searching…'
                : results
                  ? `${results.total} ${pluralise(results.total, 'tutor')} found${
                      activeCount > 0 ? ` with ${activeCount} ${pluralise(activeCount, 'filter')} applied` : ''
                    }`
                  : ''}
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSheetOpen(true)}
                className="lg:hidden"
              >
                <FilterIcon />
                Filters{activeCount > 0 ? ` (${activeCount})` : ''}
              </Button>

              <div className="w-44">
                <Select
                  label="Sort by"
                  labelHidden
                  value={filters.sort ?? 'RATING_DESC'}
                  onChange={(event) =>
                    updateFilters({ sort: event.target.value as SortKey })
                  }
                  options={SORT_OPTIONS}
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <TutorCardSkeleton key={index} />
              ))}
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : !results || results.total === 0 ? (
            // AC-11: never a blank page. Names the cause and offers the exit.
            <EmptyState
              icon={<SearchIcon />}
              title="No tutors match these filters"
              description={
                activeCount > 0
                  ? 'Try removing a filter. Narrowing by rating and rate at the same time rules out most people.'
                  : 'No tutors have published a profile yet. Check back soon.'
              }
              action={
                activeCount > 0 ? (
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear all filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {results.items.map((listing) => (
                  <li key={listing.tutorProfile.id} className="flex">
                    <div className="w-full">
                      <TutorCard listing={listing} />
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                <Pagination
                  page={results.page}
                  totalPages={results.totalPages}
                  onChange={(page) => updateFilters({ page })}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile filter sheet. Same fields as the rail. */}
      <Modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filters"
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={clearFilters}>
              Clear
            </Button>
            <Button fullWidth onClick={() => setSheetOpen(false)}>
              Show {results?.total ?? 0} {pluralise(results?.total ?? 0, 'result')}
            </Button>
          </div>
        }
      >
        <TutorFilterFields {...filterProps} />
      </Modal>
    </div>
  );
}
