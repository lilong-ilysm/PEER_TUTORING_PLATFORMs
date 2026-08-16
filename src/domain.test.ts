/**
 * Tests for the shared invariants.
 *
 * These cover the rules that both backends delegate to, so a passing run means the
 * AWS Lambda and the demo adapter agree on what is legal. The concurrency criterion
 * (AC-20) is only partly testable here: the atomicity itself is a property of the
 * DynamoDB conditional write, but the precondition logic is verified below.
 */

import { describe, expect, it } from 'vitest';
import {
  assertCanAssignRoles,
  assertCanBook,
  assertCanReview,
  assertCanSetAccountStatus,
  assertIsAdmin,
  assertNoOverlap,
  assertNotSuspended,
  assertSlotDeletable,
  assertTransition,
  canTransition,
  computeRatingAggregate,
  isAdmin,
  isBookable,
  isDiscoverable,
  isTerminalStatus,
  occupiesSlot,
  passwordProblems,
  sanitiseSelfAssignedRoles,
  slotsOverlap,
  validateEmail,
  validateHourlyRate,
  validateMessageBody,
  validateSlotTimes,
  validateTopic,
  LIMITS,
} from '../shared/domain/rules';
import { DomainErrorCode, isDomainError } from '../shared/domain/errors';
import { filterTutors, paginate, sortTutors } from '../shared/domain/search';
import type {
  AvailabilitySlot,
  Review,
  Session,
  TutorListing,
  TutorProfile,
  UserRole,
} from '../shared/domain/types';

const NOW = new Date('2026-03-01T12:00:00.000Z');

function slot(overrides: Partial<AvailabilitySlot> = {}): AvailabilitySlot {
  return {
    id: 'slot-1',
    tutorProfileId: 'tutor-1',
    tutorUserId: 'tutor-user-1',
    startAt: '2026-03-02T10:00:00.000Z',
    endAt: '2026-03-02T11:00:00.000Z',
    status: 'OPEN',
    sessionId: null,
    ...overrides,
  };
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    slotId: 'slot-1',
    tutorProfileId: 'tutor-1',
    tutorUserId: 'tutor-user-1',
    studentUserId: 'student-1',
    subjectId: 'maths',
    topic: 'Eigenvectors',
    mode: 'ONLINE',
    status: 'PENDING',
    startAt: '2026-03-02T10:00:00.000Z',
    endAt: '2026-03-02T11:00:00.000Z',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function expectDomainError(fn: () => void, code: DomainErrorCode) {
  try {
    fn();
  } catch (error) {
    expect(isDomainError(error)).toBe(true);
    if (isDomainError(error)) expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected a ${code} DomainError but nothing was thrown.`);
}

// ---------------------------------------------------------------------------

describe('session state machine (AC-23)', () => {
  it('allows only the documented transitions', () => {
    expect(canTransition('PENDING', 'CONFIRMED')).toBe(true);
    expect(canTransition('PENDING', 'DECLINED')).toBe(true);
    expect(canTransition('PENDING', 'CANCELLED')).toBe(true);
    expect(canTransition('CONFIRMED', 'COMPLETED')).toBe(true);
    expect(canTransition('CONFIRMED', 'CANCELLED')).toBe(true);
  });

  it('rejects skipping straight from pending to completed', () => {
    expect(canTransition('PENDING', 'COMPLETED')).toBe(false);
    expectDomainError(
      () => assertTransition('PENDING', 'COMPLETED'),
      DomainErrorCode.INVALID_TRANSITION,
    );
  });

  it('treats completed, cancelled and declined as terminal', () => {
    expect(isTerminalStatus('COMPLETED')).toBe(true);
    expect(isTerminalStatus('CANCELLED')).toBe(true);
    expect(isTerminalStatus('DECLINED')).toBe(true);
    expect(isTerminalStatus('PENDING')).toBe(false);
  });

  it('cannot reopen or re-cancel a terminal session', () => {
    expectDomainError(
      () => assertTransition('CANCELLED', 'CONFIRMED'),
      DomainErrorCode.INVALID_TRANSITION,
    );
    expectDomainError(
      () => assertTransition('COMPLETED', 'CANCELLED'),
      DomainErrorCode.INVALID_TRANSITION,
    );
  });

  it('only holds a slot while pending or confirmed', () => {
    expect(occupiesSlot('PENDING')).toBe(true);
    expect(occupiesSlot('CONFIRMED')).toBe(true);
    expect(occupiesSlot('CANCELLED')).toBe(false);
    expect(occupiesSlot('DECLINED')).toBe(false);
    expect(occupiesSlot('COMPLETED')).toBe(false);
  });
});

describe('slot bookability (AC-18)', () => {
  it('rejects a slot in the past', () => {
    expect(isBookable(slot({ startAt: '2026-02-28T10:00:00.000Z' }), NOW)).toBe(false);
  });

  it('rejects a slot inside the lead time', () => {
    const soon = new Date(NOW.getTime() + 10 * 60_000).toISOString();
    expect(isBookable(slot({ startAt: soon }), NOW)).toBe(false);
  });

  it('accepts a future open slot beyond the lead time', () => {
    expect(isBookable(slot(), NOW)).toBe(true);
  });

  it('rejects an already booked slot', () => {
    expect(isBookable(slot({ status: 'BOOKED' }), NOW)).toBe(false);
  });
});

describe('slot creation', () => {
  it('rejects a slot that ends before it starts', () => {
    expectDomainError(
      () =>
        validateSlotTimes('2026-03-02T11:00:00.000Z', '2026-03-02T10:00:00.000Z', NOW),
      DomainErrorCode.VALIDATION,
    );
  });

  it('rejects availability in the past', () => {
    expectDomainError(
      () =>
        validateSlotTimes('2026-02-01T10:00:00.000Z', '2026-02-01T11:00:00.000Z', NOW),
      DomainErrorCode.SLOT_IN_PAST,
    );
  });

  it('rejects a slot shorter than the minimum', () => {
    expectDomainError(
      () =>
        validateSlotTimes('2026-03-02T10:00:00.000Z', '2026-03-02T10:10:00.000Z', NOW),
      DomainErrorCode.VALIDATION,
    );
  });

  it('rejects a slot longer than the maximum', () => {
    expectDomainError(
      () =>
        validateSlotTimes('2026-03-02T10:00:00.000Z', '2026-03-02T18:00:00.000Z', NOW),
      DomainErrorCode.VALIDATION,
    );
  });

  it('accepts a valid slot', () => {
    expect(() =>
      validateSlotTimes('2026-03-02T10:00:00.000Z', '2026-03-02T11:00:00.000Z', NOW),
    ).not.toThrow();
  });

  it('detects overlapping intervals but not touching ones', () => {
    const a = { startAt: '2026-03-02T10:00:00.000Z', endAt: '2026-03-02T11:00:00.000Z' };
    const partial = {
      startAt: '2026-03-02T10:30:00.000Z',
      endAt: '2026-03-02T11:30:00.000Z',
    };
    const adjacent = {
      startAt: '2026-03-02T11:00:00.000Z',
      endAt: '2026-03-02T12:00:00.000Z',
    };

    expect(slotsOverlap(a, partial)).toBe(true);
    // Back-to-back slots are legitimate and must not be treated as a clash.
    expect(slotsOverlap(a, adjacent)).toBe(false);
  });

  it('rejects a new slot that overlaps an existing one', () => {
    expectDomainError(
      () =>
        assertNoOverlap(
          { startAt: '2026-03-02T10:30:00.000Z', endAt: '2026-03-02T11:30:00.000Z' },
          [{ startAt: '2026-03-02T10:00:00.000Z', endAt: '2026-03-02T11:00:00.000Z' }],
        ),
      DomainErrorCode.VALIDATION,
    );
  });
});

describe('slot deletion (AC-17)', () => {
  it('blocks deletion while a pending request holds the slot', () => {
    expectDomainError(
      () => assertSlotDeletable(slot(), [session({ status: 'PENDING' })]),
      DomainErrorCode.VALIDATION,
    );
  });

  it('blocks deletion while a confirmed session holds the slot', () => {
    expectDomainError(
      () => assertSlotDeletable(slot(), [session({ status: 'CONFIRMED' })]),
      DomainErrorCode.VALIDATION,
    );
  });

  it('allows deletion once the session is cancelled', () => {
    expect(() =>
      assertSlotDeletable(slot(), [session({ status: 'CANCELLED' })]),
    ).not.toThrow();
  });
});

describe('booking preconditions (AC-19, AC-20, AC-21)', () => {
  const base = {
    slot: slot(),
    studentUserId: 'student-1',
    tutorUserId: 'tutor-user-1',
    studentSessions: [] as Session[],
    now: NOW,
  };

  it('accepts a clean booking', () => {
    expect(() => assertCanBook(base)).not.toThrow();
  });

  it('rejects booking yourself', () => {
    expectDomainError(
      () => assertCanBook({ ...base, studentUserId: 'tutor-user-1' }),
      DomainErrorCode.VALIDATION,
    );
  });

  it('reports a conflict when the slot is already taken', () => {
    expectDomainError(
      () => assertCanBook({ ...base, slot: slot({ status: 'BOOKED' }) }),
      DomainErrorCode.SLOT_CONFLICT,
    );
  });

  it('rejects a duplicate active request for the same slot', () => {
    expectDomainError(
      () =>
        assertCanBook({
          ...base,
          studentSessions: [session({ slotId: 'slot-1', status: 'PENDING' })],
        }),
      DomainErrorCode.DUPLICATE_REQUEST,
    );
  });

  it('allows rebooking a slot the student previously cancelled', () => {
    expect(() =>
      assertCanBook({
        ...base,
        studentSessions: [session({ slotId: 'slot-1', status: 'CANCELLED' })],
      }),
    ).not.toThrow();
  });

  it('rejects a booking that clashes with the student\u2019s other session', () => {
    expectDomainError(
      () =>
        assertCanBook({
          ...base,
          studentSessions: [
            session({
              id: 'other',
              slotId: 'slot-other',
              status: 'CONFIRMED',
              startAt: '2026-03-02T10:30:00.000Z',
              endAt: '2026-03-02T11:30:00.000Z',
            }),
          ],
        }),
      DomainErrorCode.VALIDATION,
    );
  });

  it('rejects a slot in the past', () => {
    expectDomainError(
      () =>
        assertCanBook({
          ...base,
          slot: slot({
            startAt: '2026-02-01T10:00:00.000Z',
            endAt: '2026-02-01T11:00:00.000Z',
          }),
        }),
      DomainErrorCode.SLOT_IN_PAST,
    );
  });
});

describe('reviews (AC-25, AC-26, AC-27)', () => {
  const completed = session({ status: 'COMPLETED' });

  it('accepts a valid review from the student of a completed session', () => {
    expect(() =>
      assertCanReview({
        session: completed,
        studentUserId: 'student-1',
        existingReviews: [],
        rating: 5,
        comment: 'Very helpful.',
      }),
    ).not.toThrow();
  });

  it('rejects a review from someone who was not the student', () => {
    expectDomainError(
      () =>
        assertCanReview({
          session: completed,
          studentUserId: 'someone-else',
          existingReviews: [],
          rating: 5,
          comment: '',
        }),
      DomainErrorCode.FORBIDDEN,
    );
  });

  it('rejects a review on a session that is not completed', () => {
    expectDomainError(
      () =>
        assertCanReview({
          session: session({ status: 'CONFIRMED' }),
          studentUserId: 'student-1',
          existingReviews: [],
          rating: 5,
          comment: '',
        }),
      DomainErrorCode.INVALID_TRANSITION,
    );
  });

  it('rejects a second review for the same session', () => {
    const existing: Review[] = [
      {
        id: 'review-1',
        sessionId: 'session-1',
        tutorProfileId: 'tutor-1',
        studentUserId: 'student-1',
        rating: 4,
        comment: '',
        createdAt: NOW.toISOString(),
      },
    ];
    expectDomainError(
      () =>
        assertCanReview({
          session: completed,
          studentUserId: 'student-1',
          existingReviews: existing,
          rating: 5,
          comment: '',
        }),
      DomainErrorCode.ALREADY_REVIEWED,
    );
  });

  it('rejects out-of-range and non-integer ratings', () => {
    for (const rating of [0, 6, -1, 3.5]) {
      expectDomainError(
        () =>
          assertCanReview({
            session: completed,
            studentUserId: 'student-1',
            existingReviews: [],
            rating,
            comment: '',
          }),
        DomainErrorCode.VALIDATION,
      );
    }
  });

  it('rejects an over-long comment', () => {
    expectDomainError(
      () =>
        assertCanReview({
          session: completed,
          studentUserId: 'student-1',
          existingReviews: [],
          rating: 5,
          comment: 'x'.repeat(LIMITS.reviewCommentMax + 1),
        }),
      DomainErrorCode.VALIDATION,
    );
  });
});

describe('rating aggregate (AC-15, AC-16, AC-28)', () => {
  it('returns null rather than zero when there are no reviews', () => {
    expect(computeRatingAggregate([])).toEqual({ ratingAvg: null, ratingCount: 0 });
  });

  it('averages to one decimal place, matching what is displayed', () => {
    expect(computeRatingAggregate([5, 4])).toEqual({ ratingAvg: 4.5, ratingCount: 2 });
    expect(computeRatingAggregate([5, 4, 4])).toEqual({
      ratingAvg: 4.3,
      ratingCount: 3,
    });
  });

  it('handles a single review', () => {
    expect(computeRatingAggregate([3])).toEqual({ ratingAvg: 3, ratingCount: 1 });
  });
});

describe('messages (AC-30)', () => {
  it('rejects an empty or whitespace-only message', () => {
    expectDomainError(() => validateMessageBody(''), DomainErrorCode.VALIDATION);
    expectDomainError(() => validateMessageBody('   \n  '), DomainErrorCode.VALIDATION);
  });

  it('rejects an over-long message', () => {
    expectDomainError(
      () => validateMessageBody('x'.repeat(LIMITS.messageMax + 1)),
      DomainErrorCode.VALIDATION,
    );
  });

  it('trims an acceptable message', () => {
    expect(validateMessageBody('  hello  ')).toBe('hello');
  });
});

describe('field validation (AC-3)', () => {
  it('mirrors the Cognito password policy', () => {
    expect(passwordProblems('Password1')).toEqual([]);
    expect(passwordProblems('short1A')).toContain('at least 8 characters');
    expect(passwordProblems('alllowercase1')).toContain('an uppercase letter');
    expect(passwordProblems('ALLUPPERCASE1')).toContain('a lowercase letter');
    expect(passwordProblems('NoDigitsHere')).toContain('a number');
  });

  it('normalises and validates emails', () => {
    expect(validateEmail('  Person@Example.COM ')).toBe('person@example.com');
    expectDomainError(() => validateEmail('not-an-email'), DomainErrorCode.VALIDATION);
    expectDomainError(() => validateEmail('a@b'), DomainErrorCode.VALIDATION);
  });

  it('validates topics', () => {
    expect(validateTopic('  Integration by parts ')).toBe('Integration by parts');
    expectDomainError(() => validateTopic('a'), DomainErrorCode.VALIDATION);
  });

  it('accepts a zero rate but rejects negatives', () => {
    expect(validateHourlyRate(0)).toBe(0);
    expect(validateHourlyRate(18.499)).toBe(18.5);
    expectDomainError(() => validateHourlyRate(-1), DomainErrorCode.VALIDATION);
    expectDomainError(
      () => validateHourlyRate(LIMITS.hourlyRateMax + 1),
      DomainErrorCode.VALIDATION,
    );
  });
});

describe('discoverability (AC-13)', () => {
  it('requires publication, a subject and a bio', () => {
    expect(isDiscoverable({ isPublished: true, subjectCount: 1, bio: 'Real bio' })).toBe(
      true,
    );
    expect(
      isDiscoverable({ isPublished: false, subjectCount: 1, bio: 'Real bio' }),
    ).toBe(false);
    expect(isDiscoverable({ isPublished: true, subjectCount: 0, bio: 'Real bio' })).toBe(
      false,
    );
    expect(isDiscoverable({ isPublished: true, subjectCount: 1, bio: '   ' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function listing(
  id: string,
  overrides: Partial<TutorProfile> = {},
  extras: Partial<TutorListing> = {},
): TutorListing {
  const profile: TutorProfile = {
    id,
    userId: `user-${id}`,
    displayName: `Tutor ${id}`,
    institution: 'Northgate University',
    headline: 'Maths and physics',
    bio: 'A real bio.',
    hourlyRate: 20,
    currency: 'GBP',
    sessionMode: 'EITHER',
    levels: ['UNDERGRADUATE'],
    subjectIds: ['maths'],
    isPublished: true,
    ratingAvg: 4.5,
    ratingCount: 4,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };

  return {
    tutorProfile: profile,
    user: {
      id: profile.userId,
      displayName: profile.displayName,
      institution: profile.institution,
    },
    subjects: [{ id: 'maths', name: 'Mathematics', category: 'Mathematics & Statistics' }],
    subjectIds: profile.subjectIds,
    levels: profile.levels,
    openSlotCount: 3,
    availableWeekdays: [1, 3],
    nextAvailableAt: '2026-03-02T10:00:00.000Z',
    ...extras,
  };
}

describe('search filtering (AC-8, AC-9, AC-16)', () => {
  it('filters by subject', () => {
    const items = [listing('a'), listing('b', { subjectIds: ['physics'] })];
    expect(filterTutors(items, { subjectId: 'maths' })).toHaveLength(1);
  });

  it('filters by maximum rate', () => {
    const items = [listing('a', { hourlyRate: 10 }), listing('b', { hourlyRate: 40 })];
    expect(filterTutors(items, { maxRate: 20 })).toHaveLength(1);
  });

  it('excludes unrated tutors when a minimum rating is set', () => {
    const items = [
      listing('a', { ratingAvg: 4.8, ratingCount: 5 }),
      listing('b', { ratingAvg: null, ratingCount: 0 }),
    ];
    expect(filterTutors(items, { minRating: 4 })).toHaveLength(1);
    // With no rating filter, the unrated tutor is still discoverable.
    expect(filterTutors(items, {})).toHaveLength(2);
  });

  it('treats an EITHER tutor as matching a specific mode', () => {
    const items = [
      listing('a', { sessionMode: 'EITHER' }),
      listing('b', { sessionMode: 'IN_PERSON' }),
    ];
    expect(filterTutors(items, { mode: 'ONLINE' })).toHaveLength(1);
  });

  it('filters by weekday availability', () => {
    const items = [
      listing('a', {}, { availableWeekdays: [1, 3] }),
      listing('b', {}, { availableWeekdays: [6] }),
    ];
    expect(filterTutors(items, { weekday: 3 })).toHaveLength(1);
  });

  it('combines filters as AND', () => {
    const items = [
      listing('a', { hourlyRate: 10, ratingAvg: 4.9, ratingCount: 9 }),
      listing('b', { hourlyRate: 10, ratingAvg: 3.1, ratingCount: 9 }),
    ];
    expect(filterTutors(items, { maxRate: 15, minRating: 4 })).toHaveLength(1);
  });

  it('requires every search term to match', () => {
    const items = [
      listing('a', { headline: 'Calculus and linear algebra' }),
      listing('b', { headline: 'Organic chemistry' }),
    ];
    expect(filterTutors(items, { q: 'calculus algebra' })).toHaveLength(1);
    expect(filterTutors(items, { q: 'calculus chemistry' })).toHaveLength(0);
  });
});

describe('search sorting (AC-10)', () => {
  it('ranks unrated tutors below rated ones', () => {
    const items = [
      listing('unrated', { ratingAvg: null, ratingCount: 0 }),
      listing('rated', { ratingAvg: 3.2, ratingCount: 2 }),
    ];
    expect(sortTutors(items, 'RATING_DESC')[0]!.tutorProfile.id).toBe('rated');
  });

  it('sorts by rate ascending and descending', () => {
    const items = [listing('a', { hourlyRate: 30 }), listing('b', { hourlyRate: 10 })];
    expect(sortTutors(items, 'RATE_ASC')[0]!.tutorProfile.hourlyRate).toBe(10);
    expect(sortTutors(items, 'RATE_DESC')[0]!.tutorProfile.hourlyRate).toBe(30);
  });

  it('puts tutors with no availability last when sorting by soonest', () => {
    const items = [
      listing('none', {}, { nextAvailableAt: null }),
      listing('soon', {}, { nextAvailableAt: '2026-03-02T09:00:00.000Z' }),
    ];
    expect(sortTutors(items, 'SOONEST')[0]!.tutorProfile.id).toBe('soon');
  });
});

describe('pagination (AC-12)', () => {
  const items = Array.from({ length: 25 }, (_, index) => index);

  it('slices the requested page', () => {
    const result = paginate(items, 2, 10);
    expect(result.items).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(result.totalPages).toBe(3);
  });

  it('clamps a page beyond the end rather than returning nothing', () => {
    // A stale ?page=9 in a shared link must not produce a blank grid.
    const result = paginate(items, 9, 10);
    expect(result.page).toBe(3);
    expect(result.items).toHaveLength(5);
  });

  it('clamps a page below one', () => {
    expect(paginate(items, 0, 10).page).toBe(1);
  });

  it('reports one page for an empty result set', () => {
    const result = paginate([], 1, 10);
    expect(result.totalPages).toBe(1);
    expect(result.items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Administration
//
// These are the security tests. The first one is the most important test in the
// suite: it is the guard against any authenticated user promoting themselves to
// administrator through the self-service profile endpoint.
// ---------------------------------------------------------------------------

describe('admin authorisation (privilege escalation)', () => {
  it('refuses to let a user assign themselves ADMIN', () => {
    // The self-service endpoint takes a roles array straight from the request body.
    // ADMIN must be silently stripped, never honoured.
    expect(sanitiseSelfAssignedRoles(['STUDENT', 'ADMIN'])).toEqual(['STUDENT']);
    expect(sanitiseSelfAssignedRoles(['ADMIN', 'TUTOR'])).toEqual(['TUTOR']);
    expect(sanitiseSelfAssignedRoles(['STUDENT', 'TUTOR'])).toEqual(['STUDENT', 'TUTOR']);
  });

  it('rejects a role list that is only ADMIN, rather than silently emptying it', () => {
    expectDomainError(
      () => sanitiseSelfAssignedRoles(['ADMIN']),
      DomainErrorCode.VALIDATION,
    );
  });

  it('rejects junk and non-array input', () => {
    expectDomainError(() => sanitiseSelfAssignedRoles([]), DomainErrorCode.VALIDATION);
    expectDomainError(() => sanitiseSelfAssignedRoles('ADMIN'), DomainErrorCode.VALIDATION);
    expectDomainError(() => sanitiseSelfAssignedRoles(null), DomainErrorCode.VALIDATION);
    expectDomainError(
      () => sanitiseSelfAssignedRoles(['SUPERUSER']),
      DomainErrorCode.VALIDATION,
    );
  });

  it('deduplicates', () => {
    expect(sanitiseSelfAssignedRoles(['STUDENT', 'STUDENT'])).toEqual(['STUDENT']);
  });
});

describe('admin gate', () => {
  // `as UserRole[]`, not `as const`: the latter produces a readonly tuple, which is
  // not assignable to the mutable UserRole[] that Principal declares.
  const admin = { userId: 'admin-1', roles: ['ADMIN'] as UserRole[] };
  const learner = { userId: 'user-1', roles: ['STUDENT'] as UserRole[] };

  it('identifies admins', () => {
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(learner)).toBe(false);
    expect(isAdmin({ roles: ['STUDENT', 'ADMIN'] })).toBe(true);
  });

  it('reports NOT_FOUND rather than FORBIDDEN to a non-admin', () => {
    // Answering "forbidden" would confirm that an admin surface exists there.
    expectDomainError(() => assertIsAdmin(learner), DomainErrorCode.NOT_FOUND);
    expect(() => assertIsAdmin(admin)).not.toThrow();
  });
});

describe('account suspension', () => {
  it('blocks a suspended account', () => {
    expectDomainError(
      () => assertNotSuspended({ status: 'SUSPENDED' }),
      DomainErrorCode.FORBIDDEN,
    );
  });

  it('allows active accounts, and records with no status set', () => {
    expect(() => assertNotSuspended({ status: 'ACTIVE' })).not.toThrow();
    // Records created before the field existed must not be locked out.
    expect(() => assertNotSuspended({})).not.toThrow();
  });
});

describe('admin role assignment', () => {
  const admin = { userId: 'admin-1', roles: ['ADMIN'] as UserRole[] };
  const other = { userId: 'admin-2', roles: ['ADMIN'] as UserRole[] };

  it('lets an admin grant roles including ADMIN', () => {
    expect(
      assertCanAssignRoles({
        actor: admin,
        targetUserId: 'user-9',
        nextRoles: ['STUDENT', 'ADMIN'],
      }),
    ).toEqual(['STUDENT', 'ADMIN']);
  });

  it('refuses a non-admin actor', () => {
    expectDomainError(
      () =>
        assertCanAssignRoles({
          actor: { userId: 'user-1', roles: ['STUDENT', 'TUTOR'] },
          targetUserId: 'user-9',
          nextRoles: ['ADMIN'],
        }),
      DomainErrorCode.NOT_FOUND,
    );
  });

  it('stops an admin removing their own admin role', () => {
    // Otherwise the last administrator can lock everyone out of the panel.
    expectDomainError(
      () =>
        assertCanAssignRoles({
          actor: admin,
          targetUserId: admin.userId,
          nextRoles: ['STUDENT'],
        }),
      DomainErrorCode.VALIDATION,
    );
  });

  it('allows an admin to demote a DIFFERENT admin', () => {
    expect(
      assertCanAssignRoles({
        actor: admin,
        targetUserId: other.userId,
        nextRoles: ['STUDENT'],
      }),
    ).toEqual(['STUDENT']);
  });

  it('rejects an empty role list', () => {
    expectDomainError(
      () =>
        assertCanAssignRoles({ actor: admin, targetUserId: 'user-9', nextRoles: [] }),
      DomainErrorCode.VALIDATION,
    );
  });
});

describe('admin account status changes', () => {
  const admin = { userId: 'admin-1', roles: ['ADMIN'] as UserRole[] };
  const learner = { userId: 'user-1', roles: ['STUDENT'] as UserRole[] };

  it('lets an admin suspend a normal user', () => {
    expect(() =>
      assertCanSetAccountStatus({ actor: admin, target: learner, nextStatus: 'SUSPENDED' }),
    ).not.toThrow();
  });

  it('refuses a non-admin actor', () => {
    expectDomainError(
      () =>
        assertCanSetAccountStatus({
          actor: learner,
          target: { userId: 'user-2', roles: ['STUDENT'] },
          nextStatus: 'SUSPENDED',
        }),
      DomainErrorCode.NOT_FOUND,
    );
  });

  it('stops an admin suspending themselves', () => {
    expectDomainError(
      () => assertCanSetAccountStatus({ actor: admin, target: admin, nextStatus: 'SUSPENDED' }),
      DomainErrorCode.VALIDATION,
    );
  });

  it('stops one admin suspending another', () => {
    expectDomainError(
      () =>
        assertCanSetAccountStatus({
          actor: admin,
          target: { userId: 'admin-2', roles: ['ADMIN'] },
          nextStatus: 'SUSPENDED',
        }),
      DomainErrorCode.FORBIDDEN,
    );
  });

  it('allows reactivating an admin', () => {
    expect(() =>
      assertCanSetAccountStatus({
        actor: admin,
        target: { userId: 'admin-2', roles: ['ADMIN'], status: 'SUSPENDED' },
        nextStatus: 'ACTIVE',
      }),
    ).not.toThrow();
  });
});
