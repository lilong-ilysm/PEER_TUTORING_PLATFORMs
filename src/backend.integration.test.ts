// @vitest-environment jsdom

/**
 * End-to-end tests against the real demo backend.
 *
 * These go through the actual `Backend` implementation rather than the pure rule
 * functions, so they verify the wiring as well as the logic: that booking really
 * flips the slot, that declining really releases it, that a review really moves the
 * tutor's aggregate. Because both adapters delegate to the same rules module, a
 * pass here is meaningful evidence about the AWS path too, with one honest
 * exception noted at the concurrency test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localBackend as backend } from './lib/api/local/localBackend';
import { resetDb } from './lib/api/local/db';
import { DomainErrorCode, extractErrorCode } from '../shared/domain/errors';
import { DEMO_PASSWORD } from './lib/config';

const STUDENT_EMAIL = 'student@demo.peertutor.app';
const TUTOR_EMAIL = 'amara@demo.peertutor.app';
const OTHER_TUTOR_EMAIL = 'daniel@demo.peertutor.app';

async function expectCode(fn: () => Promise<unknown>, code: DomainErrorCode) {
  try {
    await fn();
  } catch (error) {
    expect(extractErrorCode(error)).toBe(code);
    return;
  }
  throw new Error(`Expected ${code} but the call succeeded.`);
}

/** Signs in and returns the first bookable slot for the given tutor. */
async function firstOpenSlot(tutorProfileId: string) {
  const slots = await backend.listSlotsForTutor(tutorProfileId);
  const open = slots.find(
    (slot) => slot.status === 'OPEN' && Date.parse(slot.startAt) > Date.now() + 60 * 60_000,
  );
  if (!open) throw new Error('No open slot in the seed data.');
  return open;
}

async function amarasProfileId(): Promise<string> {
  const listings = await backend.listTutorListings();
  const amara = listings.find((listing) => listing.user.displayName === 'Amara Okafor');
  if (!amara) throw new Error('Seed tutor not found.');
  return amara.tutorProfile.id;
}

beforeEach(async () => {
  resetDb();
  // Force a fresh seed and settle the singleton init for this test file.
  await backend.listTutorListings();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe('discovery (AC-8, AC-13)', () => {
  it('lists only discoverable tutors from the seed', async () => {
    const listings = await backend.listTutorListings();
    expect(listings.length).toBeGreaterThan(0);
    for (const listing of listings) {
      expect(listing.tutorProfile.isPublished).toBe(true);
      expect(listing.subjectIds.length).toBeGreaterThan(0);
      expect(listing.tutorProfile.bio.trim().length).toBeGreaterThan(0);
    }
  });

  it('exposes no email address on public listings', async () => {
    // Guests can read these records, so a leak here would be a real disclosure.
    const listings = await backend.listTutorListings();
    const serialised = JSON.stringify(listings);
    expect(serialised).not.toContain('@demo.peertutor.app');
  });

  it('keeps the card and the profile in agreement (AC-15)', async () => {
    const listings = await backend.listTutorListings();
    for (const listing of listings) {
      const single = await backend.getTutorListing(listing.tutorProfile.id);
      expect(single).not.toBeNull();
      expect(single!.tutorProfile.ratingAvg).toBe(listing.tutorProfile.ratingAvg);
      expect(single!.tutorProfile.ratingCount).toBe(listing.tutorProfile.ratingCount);
      expect(single!.tutorProfile.hourlyRate).toBe(listing.tutorProfile.hourlyRate);
      expect(single!.subjectIds).toEqual(listing.subjectIds);
    }
  });

  it('derives every stored rating from the reviews that exist (AC-28)', async () => {
    const listings = await backend.listTutorListings();
    for (const listing of listings) {
      const reviews = await backend.listReviewsForTutor(listing.tutorProfile.id);
      expect(listing.tutorProfile.ratingCount).toBe(reviews.length);

      if (reviews.length === 0) {
        // AC-16: unrated must be null, not zero.
        expect(listing.tutorProfile.ratingAvg).toBeNull();
      } else {
        const mean =
          Math.round(
            (reviews.reduce((total, review) => total + review.rating, 0) / reviews.length) *
              10,
          ) / 10;
        expect(listing.tutorProfile.ratingAvg).toBe(mean);
      }
    }
  });
});

describe('authentication (AC-1, AC-2, AC-4)', () => {
  it('registers, persists and signs in', async () => {
    const created = await backend.signUp({
      displayName: 'Test Learner',
      email: 'new.learner@example.com',
      password: 'Password123',
      roles: ['STUDENT'],
    });
    expect(created.user?.displayName).toBe('Test Learner');

    await backend.signOut();
    expect(await backend.getCurrentUser()).toBeNull();

    const signedIn = await backend.signIn('new.learner@example.com', 'Password123');
    expect(signedIn.email).toBe('new.learner@example.com');
  });

  it('rejects a duplicate email', async () => {
    await expectCode(
      () =>
        backend.signUp({
          displayName: 'Impostor',
          email: STUDENT_EMAIL,
          password: 'Password123',
          roles: ['STUDENT'],
        }),
      DomainErrorCode.EMAIL_IN_USE,
    );
  });

  it('rejects a weak password', async () => {
    await expectCode(
      () =>
        backend.signUp({
          displayName: 'Weak',
          email: 'weak@example.com',
          password: 'abc',
          roles: ['STUDENT'],
        }),
      DomainErrorCode.VALIDATION,
    );
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    // Identical messages, so the form cannot be used to enumerate accounts.
    let wrongPasswordMessage = '';
    let unknownEmailMessage = '';

    try {
      await backend.signIn(STUDENT_EMAIL, 'WrongPassword1');
    } catch (error) {
      wrongPasswordMessage = (error as Error).message;
    }
    try {
      await backend.signIn('nobody@example.com', 'WrongPassword1');
    } catch (error) {
      unknownEmailMessage = (error as Error).message;
    }

    expect(wrongPasswordMessage).toBe(unknownEmailMessage);
    expect(wrongPasswordMessage.length).toBeGreaterThan(0);
  });

  it('never stores a password in plaintext', async () => {
    await backend.signUp({
      displayName: 'Secret Holder',
      email: 'secret@example.com',
      password: 'SuperSecret123',
      roles: ['STUDENT'],
    });
    const dump = window.localStorage.getItem('peertutor.db.v1') ?? '';
    expect(dump).not.toContain('SuperSecret123');
  });
});

describe('booking lifecycle (AC-19 to AC-24)', () => {
  it('books a slot, marks it taken, and notifies the tutor', async () => {
    const profileId = await amarasProfileId();
    const slot = await firstOpenSlot(profileId);

    await backend.signIn(STUDENT_EMAIL, DEMO_PASSWORD);
    const session = await backend.bookSession({
      slotId: slot.id,
      subjectId: 'maths',
      topic: 'Eigenvectors for coursework',
    });

    expect(session.status).toBe('PENDING');

    // The slot is no longer offered to anyone else.
    const slots = await backend.listSlotsForTutor(profileId);
    expect(slots.find((candidate) => candidate.id === slot.id)?.status).toBe('BOOKED');

    // And the tutor has been told.
    await backend.signIn(TUTOR_EMAIL, DEMO_PASSWORD);
    const notifications = await backend.listMyNotifications();
    expect(notifications.some((item) => item.type === 'SESSION_REQUESTED')).toBe(true);
  });

  it('lets exactly one of two students win the same slot (AC-20)', async () => {
    // Within a tab the critical section in `mutate` makes this deterministic. True
    // cross-process atomicity on AWS comes from the DynamoDB conditional write in
    // the Lambda, which cannot be exercised without a deployed backend.
    const profileId = await amarasProfileId();
    const slot = await firstOpenSlot(profileId);

    await backend.signUp({
      displayName: 'Second Student',
      email: 'second@example.com',
      password: 'Password123',
      roles: ['STUDENT'],
    });

    await backend.signIn(STUDENT_EMAIL, DEMO_PASSWORD);
    await backend.bookSession({
      slotId: slot.id,
      subjectId: 'maths',
      topic: 'First in the queue',
    });

    await backend.signIn('second@example.com', 'Password123');
    await expectCode(
      () =>
        backend.bookSession({
          slotId: slot.id,
          subjectId: 'maths',
          topic: 'Second in the queue',
        }),
      DomainErrorCode.SLOT_CONFLICT,
    );
  });

  it('rejects a duplicate request from the same student (AC-21)', async () => {
    const profileId = await amarasProfileId();
    const slot = await firstOpenSlot(profileId);

    await backend.signIn(STUDENT_EMAIL, DEMO_PASSWORD);
    await backend.bookSession({ slotId: slot.id, subjectId: 'maths', topic: 'First try' });

    await expectCode(
      () => backend.bookSession({ slotId: slot.id, subjectId: 'maths', topic: 'Again' }),
      // The slot is already BOOKED, so the conflict check fires first.
      DomainErrorCode.SLOT_CONFLICT,
    );
  });

  it('rejects a subject the tutor does not teach', async () => {
    const profileId = await amarasProfileId();
    const slot = await firstOpenSlot(profileId);

    await backend.signIn(STUDENT_EMAIL, DEMO_PASSWORD);
    await expectCode(
      () =>
        backend.bookSession({
          slotId: slot.id,
          subjectId: 'history',
          topic: 'Wrong subject entirely',
        }),
      DomainErrorCode.VALIDATION,
    );
  });

  it('releases the slot when the tutor declines (AC-22)', async () => {
    const profileId = await amarasProfileId();
    const slot = await firstOpenSlot(profileId);

    await backend.signIn(STUDENT_EMAIL, DEMO_PASSWORD);
    const session = await backend.bookSession({
      slotId: slot.id,
      subjectId: 'maths',
      topic: 'Please decline this',
    });

    await backend.signIn(TUTOR_EMAIL, DEMO_PASSWORD);
    const declined = await backend.respondToSession(session.id, false);
    expect(declined.status).toBe('DECLINED');

    const slots = await backend.listSlotsForTutor(profileId);
    expect(slots.find((candidate) => candidate.id === slot.id)?.status).toBe('OPEN');
  });

  it('releases the slot when a participant cancels (AC-22)', async () => {
    const profileId = await amarasProfileId();
    const slot = await firstOpenSlot(profileId);

    await backend.signIn(STUDENT_EMAIL, DEMO_PASSWORD);
    const session = await backend.bookSession({
      slotId: slot.id,
      subjectId: 'maths',
      topic: 'Will be cancelled',
    });
    const cancelled = await backend.cancelSession(session.id);
    expect(cancelled.status).toBe('CANCELLED');

    const slots = await backend.listSlotsForTutor(profileId);
    expect(slots.find((candidate) => candidate.id === slot.id)?.status).toBe('OPEN');
  });

  it('stops a student accepting or completing their own request (AC-24)', async () => {
    const profileId = await amarasProfileId();
    const slot = await firstOpenSlot(profileId);

    await backend.signIn(STUDENT_EMAIL, DEMO_PASSWORD);
    const session = await backend.bookSession({
      slotId: slot.id,
      subjectId: 'maths',
      topic: 'Trying to self-approve',
    });

    await expectCode(
      () => backend.respondToSession(session.id, true),
      DomainErrorCode.FORBIDDEN,
    );
    await expectCode(
      () => backend.completeSession(session.id),
      DomainErrorCode.FORBIDDEN,
    );
  });

  it('hides a session from a non-participant (AC-29)', async () => {
    const profileId = await amarasProfileId();
    const slot = await firstOpenSlot(profileId);

    await backend.signIn(STUDENT_EMAIL, DEMO_PASSWORD);
    const session = await backend.bookSession({
      slotId: slot.id,
      subjectId: 'maths',
      topic: 'Private business',
    });

    await backend.signIn(OTHER_TUTOR_EMAIL, DEMO_PASSWORD);
    await expectCode(() => backend.getSession(session.id), DomainErrorCode.FORBIDDEN);
    await expectCode(() => backend.listMessages(session.id), DomainErrorCode.FORBIDDEN);
  });

  it('refuses to complete a session that has not started yet', async () => {
    const profileId = await amarasProfileId();
    const slot = await firstOpenSlot(profileId);

    await backend.signIn(STUDENT_EMAIL, DEMO_PASSWORD);
    const session = await backend.bookSession({
      slotId: slot.id,
      subjectId: 'maths',
      topic: 'Too early to complete',
    });

    await backend.signIn(TUTOR_EMAIL, DEMO_PASSWORD);
    await backend.respondToSession(session.id, true);
    await expectCode(
      () => backend.completeSession(session.id),
      DomainErrorCode.INVALID_TRANSITION,
    );
  });

  it('cannot change a session once it is terminal (AC-23)', async () => {
    const profileId = await amarasProfileId();
    const slot = await firstOpenSlot(profileId);

    await backend.signIn(STUDENT_EMAIL, DEMO_PASSWORD);
    const session = await backend.bookSession({
      slotId: slot.id,
      subjectId: 'maths',
      topic: 'Terminal state check',
    });
    await backend.cancelSession(session.id);

    await expectCode(
      () => backend.cancelSession(session.id),
      DomainErrorCode.INVALID_TRANSITION,
    );

    await backend.signIn(TUTOR_EMAIL, DEMO_PASSWORD);
    await expectCode(
      () => backend.respondToSession(session.id, true),
      DomainErrorCode.INVALID_TRANSITION,
    );
  });
});

describe('messaging (AC-29, AC-30)', () => {
  it('opens only once the session is confirmed, then accepts messages', async () => {
    const profileId = await amarasProfileId();
    const slot = await firstOpenSlot(profileId);

    await backend.signIn(STUDENT_EMAIL, DEMO_PASSWORD);
    const session = await backend.bookSession({
      slotId: slot.id,
      subjectId: 'maths',
      topic: 'Messaging rules',
    });

    // Pending: closed.
    await expectCode(
      () => backend.sendMessage(session.id, 'Too early'),
      DomainErrorCode.FORBIDDEN,
    );

    await backend.signIn(TUTOR_EMAIL, DEMO_PASSWORD);
    await backend.respondToSession(session.id, true);

    const sent = await backend.sendMessage(session.id, '  Which room are you in?  ');
    expect(sent.body).toBe('Which room are you in?');

    await expectCode(
      () => backend.sendMessage(session.id, '   '),
      DomainErrorCode.VALIDATION,
    );
    await expectCode(
      () => backend.sendMessage(session.id, 'x'.repeat(5000)),
      DomainErrorCode.VALIDATION,
    );

    // Both participants can read the thread.
    await backend.signIn(STUDENT_EMAIL, DEMO_PASSWORD);
    const messages = await backend.listMessages(session.id);
    expect(messages).toHaveLength(1);
  });
});

describe('reviews (AC-25 to AC-28)', () => {
  it('reviews a completed session once and moves the aggregate', async () => {
    const profileId = await amarasProfileId();
    const slot = await firstOpenSlot(profileId);

    const before = await backend.getTutorListing(profileId);
    const countBefore = before!.tutorProfile.ratingCount;

    await backend.signIn(STUDENT_EMAIL, DEMO_PASSWORD);
    const session = await backend.bookSession({
      slotId: slot.id,
      subjectId: 'maths',
      topic: 'Review flow',
    });

    await backend.signIn(TUTOR_EMAIL, DEMO_PASSWORD);
    await backend.respondToSession(session.id, true);

    // Move the clock past the session start so it can be completed. Only Date is
    // faked, so the adapter's internal setTimeout still resolves normally.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.parse(slot.endAt) + 60_000));

    await backend.completeSession(session.id);

    await backend.signIn(STUDENT_EMAIL, DEMO_PASSWORD);
    const review = await backend.submitReview(session.id, 4, 'Genuinely helpful.');
    expect(review.rating).toBe(4);

    // AC-26: only once.
    await expectCode(
      () => backend.submitReview(session.id, 5, 'Again'),
      DomainErrorCode.ALREADY_REVIEWED,
    );

    // AC-28: the aggregate reflects the new review immediately, everywhere.
    const after = await backend.getTutorListing(profileId);
    expect(after!.tutorProfile.ratingCount).toBe(countBefore + 1);

    const reviews = await backend.listReviewsForTutor(profileId);
    const mean =
      Math.round(
        (reviews.reduce((total, item) => total + item.rating, 0) / reviews.length) * 10,
      ) / 10;
    expect(after!.tutorProfile.ratingAvg).toBe(mean);
  });

  it('rejects a review on a session that was never completed (AC-25)', async () => {
    const profileId = await amarasProfileId();
    const slot = await firstOpenSlot(profileId);

    await backend.signIn(STUDENT_EMAIL, DEMO_PASSWORD);
    const session = await backend.bookSession({
      slotId: slot.id,
      subjectId: 'maths',
      topic: 'Not completed',
    });

    await expectCode(
      () => backend.submitReview(session.id, 5, 'Premature'),
      DomainErrorCode.INVALID_TRANSITION,
    );
  });
});

describe('availability management (AC-17)', () => {
  it('publishes slots, rejects overlaps, and blocks deleting a booked slot', async () => {
    await backend.signIn(TUTOR_EMAIL, DEMO_PASSWORD);

    const start = new Date(Date.now() + 30 * 86_400_000);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60_000);

    const created = await backend.createSlots([
      { startAt: start.toISOString(), endAt: end.toISOString() },
    ]);
    expect(created).toHaveLength(1);

    // Overlapping the slot just created is rejected.
    await expectCode(
      () =>
        backend.createSlots([
          {
            startAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
            endAt: new Date(end.getTime() + 30 * 60_000).toISOString(),
          },
        ]),
      DomainErrorCode.VALIDATION,
    );

    // Deletable while open.
    await backend.deleteSlot(created[0]!.id);

    // Now make one, book it, and confirm deletion is blocked.
    const second = await backend.createSlots([
      { startAt: start.toISOString(), endAt: end.toISOString() },
    ]);

    await backend.signIn(STUDENT_EMAIL, DEMO_PASSWORD);
    await backend.bookSession({
      slotId: second[0]!.id,
      subjectId: 'maths',
      topic: 'Holding this slot',
    });

    await backend.signIn(TUTOR_EMAIL, DEMO_PASSWORD);
    await expectCode(
      () => backend.deleteSlot(second[0]!.id),
      DomainErrorCode.VALIDATION,
    );
  });

  it('refuses availability in the past', async () => {
    await backend.signIn(TUTOR_EMAIL, DEMO_PASSWORD);
    const past = new Date(Date.now() - 86_400_000);
    await expectCode(
      () =>
        backend.createSlots([
          {
            startAt: past.toISOString(),
            endAt: new Date(past.getTime() + 3_600_000).toISOString(),
          },
        ]),
      DomainErrorCode.SLOT_IN_PAST,
    );
  });

  it('stops a tutor deleting someone else\u2019s slot', async () => {
    const otherProfileId = (await backend.listTutorListings()).find(
      (listing) => listing.user.displayName === 'Daniel Reyes',
    )!.tutorProfile.id;
    const slot = await firstOpenSlot(otherProfileId);

    await backend.signIn(TUTOR_EMAIL, DEMO_PASSWORD);
    await expectCode(() => backend.deleteSlot(slot.id), DomainErrorCode.FORBIDDEN);
  });
});

describe('profile changes', () => {
  it('propagates a name change to the public tutor record', async () => {
    await backend.signIn(TUTOR_EMAIL, DEMO_PASSWORD);
    const profile = await backend.getMyTutorProfile();
    expect(profile).not.toBeNull();

    await backend.updateMyUserProfile({ displayName: 'Amara O.' });

    // Otherwise the card and the account would disagree about the person's name.
    const updated = await backend.getTutorListing(profile!.id);
    expect(updated!.user.displayName).toBe('Amara O.');
    expect(updated!.tutorProfile.displayName).toBe('Amara O.');
  });

  it('requires a subject before a tutor profile can be saved (AC-13)', async () => {
    await backend.signIn(TUTOR_EMAIL, DEMO_PASSWORD);
    await expectCode(
      () =>
        backend.saveMyTutorProfile({
          headline: 'A perfectly fine headline here',
          bio: 'A bio that is comfortably long enough to pass the minimum length check.',
          hourlyRate: 10,
          sessionMode: 'ONLINE',
          levels: ['UNDERGRADUATE'],
          subjectIds: [],
          isPublished: true,
        }),
      DomainErrorCode.VALIDATION,
    );
  });
});
