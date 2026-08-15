/**
 * Tutor search: filtering, sorting, pagination.
 *
 * Pure functions over already-materialised listings, so the same behaviour backs
 * AC-8 through AC-12 in either backend and can be unit tested without I/O.
 */

import type { Paginated, SortKey, TutorListing, TutorSearchFilters } from './types';

/** `EITHER` means the tutor accepts both, so it satisfies any mode filter. */
export function modeMatches(tutorMode: string, wanted: string): boolean {
  if (tutorMode === wanted) return true;
  if (tutorMode === 'EITHER') return true;
  // A student asking for "either" is happy with a tutor who does one of them.
  if (wanted === 'EITHER') return true;
  return false;
}

function matchesText(listing: TutorListing, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    listing.user.displayName,
    listing.user.institution ?? '',
    listing.tutorProfile.headline,
    listing.tutorProfile.bio,
    ...listing.subjects.map((subject) => subject.name),
    ...listing.subjects.map((subject) => subject.category),
  ]
    .join(' ')
    .toLowerCase();

  // Every whitespace-separated term must appear, so extra words narrow rather
  // than widen the result set.
  return needle
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}

export function filterTutors(
  listings: TutorListing[],
  filters: TutorSearchFilters,
): TutorListing[] {
  return listings.filter((listing) => {
    const { tutorProfile } = listing;

    if (filters.subjectId && !listing.subjectIds.includes(filters.subjectId)) {
      return false;
    }
    if (filters.level && !listing.levels.includes(filters.level)) {
      return false;
    }
    if (filters.mode && !modeMatches(tutorProfile.sessionMode, filters.mode)) {
      return false;
    }
    // AC-16: an unrated tutor is excluded from rating filters rather than being
    // treated as zero stars.
    if (filters.minRating !== undefined && filters.minRating > 0) {
      if (tutorProfile.ratingAvg === null) return false;
      if (tutorProfile.ratingAvg < filters.minRating) return false;
    }
    if (filters.maxRate !== undefined && tutorProfile.hourlyRate > filters.maxRate) {
      return false;
    }
    if (filters.weekday !== undefined && !listing.availableWeekdays.includes(filters.weekday)) {
      return false;
    }
    if (filters.q && !matchesText(listing, filters.q)) {
      return false;
    }
    return true;
  });
}

const NAME_TIEBREAK = (a: TutorListing, b: TutorListing) =>
  a.user.displayName.localeCompare(b.user.displayName);

export function sortTutors(listings: TutorListing[], sort: SortKey = 'RATING_DESC'): TutorListing[] {
  const copy = [...listings];

  switch (sort) {
    case 'RATE_ASC':
      copy.sort(
        (a, b) => a.tutorProfile.hourlyRate - b.tutorProfile.hourlyRate || NAME_TIEBREAK(a, b),
      );
      break;
    case 'RATE_DESC':
      copy.sort(
        (a, b) => b.tutorProfile.hourlyRate - a.tutorProfile.hourlyRate || NAME_TIEBREAK(a, b),
      );
      break;
    case 'REVIEWS_DESC':
      copy.sort(
        (a, b) => b.tutorProfile.ratingCount - a.tutorProfile.ratingCount || NAME_TIEBREAK(a, b),
      );
      break;
    case 'SOONEST':
      copy.sort((a, b) => {
        // Tutors with no upcoming availability sort last rather than first.
        const aTime = a.nextAvailableAt ? Date.parse(a.nextAvailableAt) : Number.POSITIVE_INFINITY;
        const bTime = b.nextAvailableAt ? Date.parse(b.nextAvailableAt) : Number.POSITIVE_INFINITY;
        return aTime - bTime || NAME_TIEBREAK(a, b);
      });
      break;
    case 'RATING_DESC':
    default:
      copy.sort((a, b) => {
        // Unrated tutors rank below rated ones instead of above them.
        const aRating = a.tutorProfile.ratingAvg ?? -1;
        const bRating = b.tutorProfile.ratingAvg ?? -1;
        return (
          bRating - aRating ||
          b.tutorProfile.ratingCount - a.tutorProfile.ratingCount ||
          NAME_TIEBREAK(a, b)
        );
      });
      break;
  }

  return copy;
}

export const DEFAULT_PAGE_SIZE = 9;

export function paginate<T>(items: T[], page = 1, pageSize = DEFAULT_PAGE_SIZE): Paginated<T> {
  const safeSize = Math.max(1, Math.floor(pageSize));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safeSize));
  // Clamp so a stale ?page=9 in a shared link cannot produce a blank grid.
  const safePage = Math.min(Math.max(1, Math.floor(page)), totalPages);
  const start = (safePage - 1) * safeSize;

  return {
    items: items.slice(start, start + safeSize),
    total,
    page: safePage,
    pageSize: safeSize,
    totalPages,
  };
}

export function searchTutors(
  listings: TutorListing[],
  filters: TutorSearchFilters,
): Paginated<TutorListing> {
  const filtered = filterTutors(listings, filters);
  const sorted = sortTutors(filtered, filters.sort);
  return paginate(sorted, filters.page ?? 1, filters.pageSize ?? DEFAULT_PAGE_SIZE);
}

export function countActiveFilters(filters: TutorSearchFilters): number {
  let count = 0;
  if (filters.q?.trim()) count += 1;
  if (filters.subjectId) count += 1;
  if (filters.level) count += 1;
  if (filters.mode) count += 1;
  if (filters.minRating !== undefined && filters.minRating > 0) count += 1;
  if (filters.maxRate !== undefined) count += 1;
  if (filters.weekday !== undefined) count += 1;
  return count;
}
