/**
 * The contract both backends implement.
 *
 * Having one interface with two implementations is what lets the product be
 * reviewed and QA'd today without AWS credentials, while the AWS implementation
 * remains the real production path. Both delegate their invariant checks to
 * `shared/domain/rules.ts`, so they cannot disagree about what is legal.
 */

import type {
  AcademicLevel,
  AppNotification,
  AvailabilitySlot,
  Message,
  Review,
  SessionMode,
  SessionView,
  TutorListing,
  TutorProfile,
  UserProfile,
  UserRole,
} from '../../../shared/domain/types';

export interface AuthUser {
  userId: string;
  displayName: string;
  email: string;
  roles: UserRole[];
}

export interface SignUpInput {
  displayName: string;
  email: string;
  password: string;
  roles: UserRole[];
  institution?: string;
}

export interface UpdateUserProfileInput {
  displayName?: string;
  institution?: string | null;
  bio?: string | null;
  roles?: UserRole[];
}

export interface TutorProfileInput {
  headline: string;
  bio: string;
  hourlyRate: number;
  sessionMode: SessionMode;
  levels: AcademicLevel[];
  subjectIds: string[];
  isPublished: boolean;
}

export interface CreateSlotInput {
  startAt: string;
  endAt: string;
}

export interface BookSessionInput {
  slotId: string;
  subjectId: string;
  topic: string;
  note?: string;
}

/**
 * Cognito emails a verification code on sign-up, so registration is a two-step
 * flow on AWS and a one-step flow in demo mode. The difference is modelled here
 * rather than papered over, because hiding it would mean either a fake
 * confirmation screen in demo mode or a broken one in production.
 */
export interface SignUpResult {
  needsConfirmation: boolean;
  user: AuthUser | null;
  email: string;
}

export interface Backend {
  readonly kind: 'amplify' | 'local';

  // --- Authentication -----------------------------------------------------
  getCurrentUser(): Promise<AuthUser | null>;
  signUp(input: SignUpInput): Promise<SignUpResult>;
  /** Only meaningful when `signUp` reported `needsConfirmation`. */
  confirmSignUp(email: string, code: string, password?: string): Promise<AuthUser | null>;
  resendConfirmationCode(email: string): Promise<void>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;

  // --- Profiles -----------------------------------------------------------
  getMyUserProfile(): Promise<UserProfile | null>;
  updateMyUserProfile(input: UpdateUserProfileInput): Promise<UserProfile>;
  getMyTutorProfile(): Promise<TutorProfile | null>;
  saveMyTutorProfile(input: TutorProfileInput): Promise<TutorProfile>;

  // --- Discovery ----------------------------------------------------------
  /** Every discoverable tutor, already materialised into the canonical shape. */
  listTutorListings(): Promise<TutorListing[]>;
  getTutorListing(tutorProfileId: string): Promise<TutorListing | null>;

  // --- Availability -------------------------------------------------------
  listSlotsForTutor(tutorProfileId: string): Promise<AvailabilitySlot[]>;
  listMySlots(): Promise<AvailabilitySlot[]>;
  createSlots(inputs: CreateSlotInput[]): Promise<AvailabilitySlot[]>;
  deleteSlot(slotId: string): Promise<void>;

  // --- Sessions -----------------------------------------------------------
  listMySessions(): Promise<SessionView[]>;
  getSession(sessionId: string): Promise<SessionView | null>;
  bookSession(input: BookSessionInput): Promise<SessionView>;
  respondToSession(
    sessionId: string,
    accept: boolean,
    meetingLink?: string,
  ): Promise<SessionView>;
  cancelSession(sessionId: string): Promise<SessionView>;
  completeSession(sessionId: string): Promise<SessionView>;

  // --- Reviews ------------------------------------------------------------
  listReviewsForTutor(tutorProfileId: string): Promise<Review[]>;
  submitReview(sessionId: string, rating: number, comment: string): Promise<Review>;

  // --- Messages -----------------------------------------------------------
  listMessages(sessionId: string): Promise<Message[]>;
  sendMessage(sessionId: string, body: string): Promise<Message>;

  // --- Notifications ------------------------------------------------------
  listMyNotifications(): Promise<AppNotification[]>;
  markNotificationRead(notificationId: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
}
