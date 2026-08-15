/**
 * Business rules and invariants.
 *
 * Imported by BOTH the AWS Lambda handlers and the browser-local adapter, so the
 * two backends cannot drift apart. Every function here is pure: no I/O, no clock
 * access except through an injected `now`.
 *
 * These rules back acceptance criteria AC-3, AC-17 through AC-27, AC-30.
 */

import { DomainError, DomainErrorCode } from './errors';
import type {
  AvailabilitySlot,
  Review,
  Session,
  SessionStatus,
} from './types';

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const LIMITS = {
  passwordMin: 8,
  passwordMax: 128,
  displayNameMin: 2,
  displayNameMax: 60,
  headlineMax: 90,
  bioMax: 1200,
  topicMin: 3,
  topicMax: 120,
  noteMax: 500,
  reviewCommentMax: 800,
  messageMax: 2000,
  hourlyRateMax: 500,
  slotMinMinutes: 30,
  slotMaxMinutes: 240,
  /** A slot must start at least this far in the future to be bookable. */
  bookingLeadMinutes: 30,
} as const;

// ---------------------------------------------------------------------------
// Session state machine (AC-23)
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  PENDING: ['CONFIRMED', 'DECLINED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  DECLINED: [],
  CANCELLED: [],
  COMPLETED: [],
};

export function isTerminalStatus(status: SessionStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: SessionStatus, to: SessionStatus): void {
  if (!canTransition(from, to)) {
    throw new DomainError(
      DomainErrorCode.INVALID_TRANSITION,
      isTerminalStatus(from)
        ? `This session is already ${from.toLowerCase()} and can no longer be changed.`
        : `A ${from.toLowerCase()} session cannot become ${to.toLowerCase()}.`,
    );
  }
}

/** A session occupies its slot while pending or confirmed. */
export function occupiesSlot(status: SessionStatus): boolean {
  return status === 'PENDING' || status === 'CONFIRMED';
}

// ---------------------------------------------------------------------------
// Authorisation (AC-24)
// ---------------------------------------------------------------------------

export function assertIsTutorOf(session: Session, userId: string): void {
  if (session.tutorUserId !== userId) {
    throw new DomainError(
      DomainErrorCode.FORBIDDEN,
      'Only the tutor for this session can do that.',
    );
  }
}

export function assertIsStudentOf(session: Session, userId: string): void {
  if (session.studentUserId !== userId) {
    throw new DomainError(
      DomainErrorCode.FORBIDDEN,
      'Only the student who booked this session can do that.',
    );
  }
}

export function isParticipant(session: Session, userId: string): boolean {
  return session.tutorUserId === userId || session.studentUserId === userId;
}

export function assertIsParticipant(session: Session, userId: string): void {
  if (!isParticipant(session, userId)) {
    throw new DomainError(
      DomainErrorCode.FORBIDDEN,
      'You are not a participant in this session.',
    );
  }
}

// ---------------------------------------------------------------------------
// Slots and booking (AC-17 to AC-22)
// ---------------------------------------------------------------------------

export function minutesBetween(startAt: string, endAt: string): number {
  return (Date.parse(endAt) - Date.parse(startAt)) / 60000;
}

export function isPastSlot(slot: Pick<AvailabilitySlot, 'startAt'>, now: Date): boolean {
  return Date.parse(slot.startAt) <= now.getTime();
}

/** AC-18: past slots are never bookable, plus a lead-time buffer. */
export function isBookable(
  slot: Pick<AvailabilitySlot, 'startAt' | 'status'>,
  now: Date,
): boolean {
  if (slot.status !== 'OPEN') return false;
  const leadMs = LIMITS.bookingLeadMinutes * 60_000;
  return Date.parse(slot.startAt) - now.getTime() >= leadMs;
}

export function validateSlotTimes(startAt: string, endAt: string, now: Date): void {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);

  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new DomainError(DomainErrorCode.VALIDATION, 'The slot times are not valid dates.');
  }
  if (end <= start) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      'The slot must end after it starts.',
      'endAt',
    );
  }
  if (start <= now.getTime()) {
    throw new DomainError(
      DomainErrorCode.SLOT_IN_PAST,
      'You cannot add availability in the past.',
      'startAt',
    );
  }
  const duration = (end - start) / 60000;
  if (duration < LIMITS.slotMinMinutes) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      `A slot must be at least ${LIMITS.slotMinMinutes} minutes long.`,
      'endAt',
    );
  }
  if (duration > LIMITS.slotMaxMinutes) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      `A slot cannot be longer than ${LIMITS.slotMaxMinutes / 60} hours.`,
      'endAt',
    );
  }
}

/** Two intervals overlap if each starts before the other ends. */
export function slotsOverlap(
  a: Pick<AvailabilitySlot, 'startAt' | 'endAt'>,
  b: Pick<AvailabilitySlot, 'startAt' | 'endAt'>,
): boolean {
  return Date.parse(a.startAt) < Date.parse(b.endAt) && Date.parse(b.startAt) < Date.parse(a.endAt);
}

export function assertNoOverlap(
  candidate: Pick<AvailabilitySlot, 'startAt' | 'endAt'>,
  existing: Pick<AvailabilitySlot, 'startAt' | 'endAt'>[],
): void {
  if (existing.some((slot) => slotsOverlap(candidate, slot))) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      'That overlaps a slot you have already published.',
      'startAt',
    );
  }
}

/** AC-17: a slot with an active booking cannot be deleted. */
export function assertSlotDeletable(slot: AvailabilitySlot, activeSessions: Session[]): void {
  const blocking = activeSessions.find(
    (session) => session.slotId === slot.id && occupiesSlot(session.status),
  );
  if (blocking) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      blocking.status === 'CONFIRMED'
        ? 'This slot has a confirmed session. Cancel the session first.'
        : 'This slot has a pending request. Decline the request first.',
    );
  }
}

/**
 * AC-19, AC-20, AC-21. Validates a booking attempt against the current slot and
 * the requesting student's existing sessions. The atomic guarantee for AC-20 is
 * provided by the storage layer (a DynamoDB conditional write, or a synchronous
 * re-check in the local adapter); this function covers everything else.
 */
export function assertCanBook(params: {
  slot: AvailabilitySlot;
  studentUserId: string;
  tutorUserId: string;
  studentSessions: Session[];
  now: Date;
}): void {
  const { slot, studentUserId, tutorUserId, studentSessions, now } = params;

  if (studentUserId === tutorUserId) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      'You cannot book a session with yourself.',
    );
  }
  if (slot.status !== 'OPEN') {
    throw new DomainError(
      DomainErrorCode.SLOT_CONFLICT,
      'That time was just taken. Pick another slot.',
    );
  }
  if (isPastSlot(slot, now)) {
    throw new DomainError(DomainErrorCode.SLOT_IN_PAST, 'That time has already passed.');
  }
  if (!isBookable(slot, now)) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      `Sessions must be booked at least ${LIMITS.bookingLeadMinutes} minutes in advance.`,
    );
  }

  // AC-21: no two active requests for the same slot from the same student.
  const duplicate = studentSessions.find(
    (session) => session.slotId === slot.id && occupiesSlot(session.status),
  );
  if (duplicate) {
    throw new DomainError(
      DomainErrorCode.DUPLICATE_REQUEST,
      'You already have a request for this time.',
    );
  }

  // A student cannot be in two places at once.
  const clash = studentSessions.find(
    (session) =>
      occupiesSlot(session.status) &&
      slotsOverlap({ startAt: slot.startAt, endAt: slot.endAt }, session),
  );
  if (clash) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      'You already have another session at that time.',
    );
  }
}

// ---------------------------------------------------------------------------
// Reviews (AC-25 to AC-28)
// ---------------------------------------------------------------------------

export function assertCanReview(params: {
  session: Session;
  studentUserId: string;
  existingReviews: Review[];
  rating: number;
  comment: string;
}): void {
  const { session, studentUserId, existingReviews, rating, comment } = params;

  assertIsStudentOf(session, studentUserId);

  if (session.status !== 'COMPLETED') {
    throw new DomainError(
      DomainErrorCode.INVALID_TRANSITION,
      'You can only review a session after it has been completed.',
    );
  }
  if (existingReviews.some((review) => review.sessionId === session.id)) {
    throw new DomainError(
      DomainErrorCode.ALREADY_REVIEWED,
      'You have already reviewed this session.',
    );
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      'Choose a rating between 1 and 5 stars.',
      'rating',
    );
  }
  const trimmed = comment.trim();
  if (trimmed.length > LIMITS.reviewCommentMax) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      `Keep your review under ${LIMITS.reviewCommentMax} characters.`,
      'comment',
    );
  }
}

/**
 * AC-15, AC-28. The single source of truth for a tutor's aggregate rating.
 * Returns null (not 0) when there are no reviews so AC-16 can distinguish
 * "unrated" from "rated badly".
 */
export function computeRatingAggregate(ratings: number[]): {
  ratingAvg: number | null;
  ratingCount: number;
} {
  if (ratings.length === 0) return { ratingAvg: null, ratingCount: 0 };
  const sum = ratings.reduce((total, value) => total + value, 0);
  // One decimal place, matching what the UI renders, so the stored value and the
  // displayed value can never disagree.
  return {
    ratingAvg: Math.round((sum / ratings.length) * 10) / 10,
    ratingCount: ratings.length,
  };
}

// ---------------------------------------------------------------------------
// Messaging (AC-29, AC-30)
// ---------------------------------------------------------------------------

export function assertCanMessage(session: Session, userId: string): void {
  assertIsParticipant(session, userId);
  if (session.status === 'PENDING') {
    throw new DomainError(
      DomainErrorCode.FORBIDDEN,
      'Messaging opens once the session is confirmed.',
    );
  }
  if (session.status === 'DECLINED' || session.status === 'CANCELLED') {
    throw new DomainError(
      DomainErrorCode.FORBIDDEN,
      'This session is closed, so messaging is no longer available.',
    );
  }
}

export function validateMessageBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new DomainError(DomainErrorCode.VALIDATION, 'Type a message first.', 'body');
  }
  if (trimmed.length > LIMITS.messageMax) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      `Messages are limited to ${LIMITS.messageMax} characters.`,
      'body',
    );
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Field validation (AC-3)
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(email: string): string {
  const normalised = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalised)) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      'Enter a valid email address.',
      'email',
    );
  }
  return normalised;
}

/**
 * Returns a list of unmet requirements; empty means the password is acceptable.
 *
 * These rules mirror the Cognito user pool password policy configured in
 * `amplify/backend.ts` exactly. If the two drift apart, users get a confusing
 * server-side rejection after passing client validation, so they are deliberately
 * kept in lockstep.
 */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < LIMITS.passwordMin) {
    problems.push(`at least ${LIMITS.passwordMin} characters`);
  }
  if (!/[a-z]/.test(password)) problems.push('a lowercase letter');
  if (!/[A-Z]/.test(password)) problems.push('an uppercase letter');
  if (!/[0-9]/.test(password)) problems.push('a number');
  if (password.length > LIMITS.passwordMax) {
    problems.push(`no more than ${LIMITS.passwordMax} characters`);
  }
  return problems;
}

export function validatePassword(password: string): string {
  const problems = passwordProblems(password);
  if (problems.length > 0) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      `Your password needs ${problems.join(', ')}.`,
      'password',
    );
  }
  return password;
}

export function validateDisplayName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length < LIMITS.displayNameMin) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      'Enter your name so tutors know who they are meeting.',
      'displayName',
    );
  }
  if (trimmed.length > LIMITS.displayNameMax) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      `Names are limited to ${LIMITS.displayNameMax} characters.`,
      'displayName',
    );
  }
  return trimmed;
}

export function validateTopic(topic: string): string {
  const trimmed = topic.trim();
  if (trimmed.length < LIMITS.topicMin) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      'Describe what you want help with, so your tutor can prepare.',
      'topic',
    );
  }
  if (trimmed.length > LIMITS.topicMax) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      `Keep the topic under ${LIMITS.topicMax} characters.`,
      'topic',
    );
  }
  return trimmed;
}

export function validateHourlyRate(rate: number): number {
  if (!Number.isFinite(rate) || rate < 0) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      'Enter 0 if you tutor for free, or a positive amount.',
      'hourlyRate',
    );
  }
  if (rate > LIMITS.hourlyRateMax) {
    throw new DomainError(
      DomainErrorCode.VALIDATION,
      `Rates above ${LIMITS.hourlyRateMax} are not supported.`,
      'hourlyRate',
    );
  }
  return Math.round(rate * 100) / 100;
}

/**
 * AC-13: a tutor is only discoverable with a published profile AND a subject.
 * Enforced in one place so search and the profile page cannot disagree.
 */
export function isDiscoverable(params: {
  isPublished: boolean;
  subjectCount: number;
  bio: string;
}): boolean {
  return params.isPublished && params.subjectCount > 0 && params.bio.trim().length > 0;
}
