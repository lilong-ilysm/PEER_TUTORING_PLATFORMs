/**
 * Canonical domain types.
 *
 * This module is imported by BOTH the browser app (`src/`) and the AWS Lambda
 * handlers (`amplify/functions/`). Keep it dependency-free and side-effect free.
 */

export type UserRole = 'STUDENT' | 'TUTOR';

export type AcademicLevel =
  | 'HIGH_SCHOOL'
  | 'FOUNDATION'
  | 'UNDERGRADUATE'
  | 'POSTGRADUATE';

export type SessionMode = 'ONLINE' | 'IN_PERSON' | 'EITHER';

export type SlotStatus = 'OPEN' | 'BOOKED';

export type SessionStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'COMPLETED';

export type NotificationType =
  | 'SESSION_REQUESTED'
  | 'SESSION_CONFIRMED'
  | 'SESSION_DECLINED'
  | 'SESSION_CANCELLED'
  | 'SESSION_COMPLETED'
  | 'REVIEW_RECEIVED'
  | 'MESSAGE_RECEIVED';

export interface Subject {
  id: string;
  name: string;
  category: string;
}

export interface UserProfile {
  /** Record id. On AWS this is the DynamoDB row id, not the Cognito subject. */
  id: string;
  /**
   * The identity this profile belongs to. On AWS it is the Cognito `sub`, which is
   * what every ownership check compares against. In demo mode it equals `id`.
   */
  userId: string;
  displayName: string;
  email: string;
  roles: UserRole[];
  institution?: string | null;
  headline?: string | null;
  bio?: string | null;
  createdAt: string;
}

export interface TutorProfile {
  id: string;
  userId: string;
  /**
   * Denormalised from the account record. The private `UserProfile` model holds an
   * email address and so is never publicly readable; copying the public display
   * name here is what lets a guest browse tutors without exposing anything private.
   */
  displayName: string;
  institution?: string | null;
  headline: string;
  bio: string;
  hourlyRate: number;
  currency: string;
  sessionMode: SessionMode;
  levels: AcademicLevel[];
  /** References into the fixed subject catalogue in `subjects.ts`. */
  subjectIds: string[];
  isPublished: boolean;
  /** Mean of this tutor's reviews. null when there are no reviews (AC-16). */
  ratingAvg: number | null;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilitySlot {
  id: string;
  tutorProfileId: string;
  /** Owning identity. Carried on the record so ownership needs no extra lookup. */
  tutorUserId: string;
  /** ISO-8601 UTC instant. */
  startAt: string;
  endAt: string;
  status: SlotStatus;
  /** Set when status is BOOKED. The invariant is enforced server-side. */
  sessionId?: string | null;
}

export interface Session {
  id: string;
  slotId: string;
  tutorProfileId: string;
  tutorUserId: string;
  studentUserId: string;
  subjectId: string;
  topic: string;
  note?: string | null;
  mode: SessionMode;
  status: SessionStatus;
  startAt: string;
  endAt: string;
  meetingLink?: string | null;
  cancelledByUserId?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A session plus the denormalised names needed to render it. Both backends store
 * the counterpart's display name on the record, because resolving it would
 * otherwise require exposing the private `UserProfile` model publicly.
 */
export interface SessionView extends Session {
  tutorName: string;
  studentName: string;
  hasReview: boolean;
}

export interface Review {
  id: string;
  sessionId: string;
  tutorProfileId: string;
  studentUserId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface Message {
  id: string;
  sessionId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  linkTo: string;
  read: boolean;
  createdAt: string;
}

/**
 * A tutor as presented to the UI. The card, the profile header and the dashboard
 * row are all rendered from this single shape, which is how AC-15 (card and
 * profile must agree) is satisfied structurally rather than by convention.
 */
export interface TutorListing {
  tutorProfile: TutorProfile;
  /** Public identity only. Sourced from the denormalised fields on TutorProfile. */
  user: {
    id: string;
    displayName: string;
    institution?: string | null;
  };
  subjects: Subject[];
  subjectIds: string[];
  levels: AcademicLevel[];
  /** Count of future OPEN slots. */
  openSlotCount: number;
  /** Weekdays (0=Sun..6=Sat) that have at least one future OPEN slot. */
  availableWeekdays: number[];
  nextAvailableAt: string | null;
}

export type SortKey =
  | 'RATING_DESC'
  | 'RATE_ASC'
  | 'RATE_DESC'
  | 'REVIEWS_DESC'
  | 'SOONEST';

export interface TutorSearchFilters {
  q?: string;
  subjectId?: string;
  level?: AcademicLevel;
  mode?: SessionMode;
  minRating?: number;
  maxRate?: number;
  weekday?: number;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
