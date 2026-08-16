/**
 * REST backend: API Gateway + Lambda + DynamoDB, with a Cognito user pool for auth.
 *
 * This is the deployment target for the AWS Academy Learner Lab, where Amplify
 * Gen 2 cannot be deployed (it needs `iam:CreateRole`, which the lab denies).
 *
 * It implements exactly the same `Backend` contract as the Amplify and demo
 * adapters, which is why swapping to it required no changes to any component,
 * page, route or business rule.
 *
 * Authentication uses Amplify's Cognito client with a **user pool only** — no
 * identity pool, because an identity pool would require two IAM roles. The browser
 * therefore never receives AWS credentials; it holds a JWT, and API Gateway
 * validates it.
 */

import { Amplify } from 'aws-amplify';
import {
  confirmSignUp as cognitoConfirmSignUp,
  fetchAuthSession,
  getCurrentUser as cognitoGetCurrentUser,
  resendSignUpCode,
  signIn as cognitoSignIn,
  signOut as cognitoSignOut,
  signUp as cognitoSignUp,
} from 'aws-amplify/auth';

import { DomainError, DomainErrorCode } from '../../../../shared/domain/errors';
import {
  validateDisplayName,
  validateEmail,
  validatePassword,
} from '../../../../shared/domain/rules';
import type {
  AccountStatus,
  AdminOverview,
  AdminReviewRow,
  AdminSessionRow,
  AdminUserDetail,
  AdminUserSummary,
  AppNotification,
  AvailabilitySlot,
  Message,
  Review,
  SessionView,
  TutorListing,
  TutorProfile,
  UserProfile,
  UserRole,
} from '../../../../shared/domain/types';
import { REST_CONFIG } from '../../config';
import type {
  AuthUser,
  Backend,
  BookSessionInput,
  CreateSlotInput,
  SignUpInput,
  SignUpResult,
  TutorProfileInput,
  UpdateUserProfileInput,
} from '../contract';

// ---------------------------------------------------------------------------
// Cognito setup
// ---------------------------------------------------------------------------

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: REST_CONFIG.userPoolId,
      userPoolClientId: REST_CONFIG.userPoolClientId,
    },
  },
});

/**
 * Roles are chosen during registration, but the user record cannot be written
 * until Cognito has confirmed the email. The choice is parked here in the interim.
 * Roles stay editable from the profile screen, so the worst case if this is lost is
 * that the user picks again.
 */
const PENDING_KEY = 'peerlearn.pendingSignup';

function stashPending(roles: UserRole[], institution?: string): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ roles, institution }));
  } catch {
    /* storage unavailable; profile bootstrap falls back to STUDENT */
  }
}

function takePending(): { roles: UserRole[]; institution?: string } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_KEY);
    return JSON.parse(raw) as { roles: UserRole[]; institution?: string };
  } catch {
    return null;
  }
}

function translateAuthError(error: unknown): never {
  const name = (error as { name?: string })?.name ?? '';
  const message = (error as { message?: string })?.message ?? '';

  switch (name) {
    case 'UsernameExistsException':
      throw new DomainError(
        DomainErrorCode.EMAIL_IN_USE,
        'An account already exists with that email. Try signing in instead.',
        'email',
      );
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
      // Identical message for both, so the form cannot enumerate accounts.
      throw new DomainError(
        DomainErrorCode.INVALID_CREDENTIALS,
        'That email and password combination is not correct.',
      );
    case 'UserNotConfirmedException':
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        'Confirm your email address first. Check your inbox for the code.',
      );
    case 'CodeMismatchException':
      throw new DomainError(DomainErrorCode.VALIDATION, 'That code is not correct.', 'code');
    case 'ExpiredCodeException':
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        'That code has expired. Request a new one.',
        'code',
      );
    case 'LimitExceededException':
    case 'TooManyRequestsException':
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        'Too many attempts. Wait a moment and try again.',
      );
    case 'InvalidPasswordException':
      throw new DomainError(DomainErrorCode.VALIDATION, message, 'password');
    default:
      throw new DomainError(
        DomainErrorCode.INTERNAL,
        message || 'Could not complete that request.',
      );
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function idToken(): Promise<string> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) {
    throw new DomainError(DomainErrorCode.UNAUTHENTICATED, 'You need to sign in first.');
  }
  return token;
}

interface ApiErrorBody {
  code?: string;
  message?: string;
  field?: string;
}

/**
 * Converts a non-2xx response into a DomainError carrying the server's own code,
 * so the UI reacts identically regardless of which backend is in use.
 */
async function toDomainError(response: Response): Promise<DomainError> {
  let body: ApiErrorBody = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    /* non-JSON error body, fall through to the status-based message */
  }

  const code =
    body.code && body.code in DomainErrorCode
      ? DomainErrorCode[body.code as keyof typeof DomainErrorCode]
      : response.status === 401
        ? DomainErrorCode.UNAUTHENTICATED
        : response.status === 403
          ? DomainErrorCode.FORBIDDEN
          : response.status === 404
            ? DomainErrorCode.NOT_FOUND
            : DomainErrorCode.INTERNAL;

  const message =
    body.message ??
    (response.status === 401
      ? 'Your session has expired. Sign in again.'
      : 'Something went wrong. Please try again.');

  return new DomainError(code, message, body.field);
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = await idToken();

  let response: Response;
  try {
    response = await fetch(`${REST_CONFIG.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // A network-level failure, not an application error.
    throw new DomainError(
      DomainErrorCode.INTERNAL,
      'Could not reach the server. Check your connection and try again.',
    );
  }

  if (!response.ok) throw await toDomainError(response);
  if (response.status === 204) return null as T;

  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Unauthenticated read. Guests browse tutors before creating an account. */
function publicGet<T>(path: string): Promise<T> {
  return request<T>(`/public${path}`, { auth: false });
}

function apiGet<T>(path: string): Promise<T> {
  return request<T>(`/api${path}`);
}

function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  return request<T>(`/api${path}`, { method, body });
}

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

async function loadAuthUser(): Promise<AuthUser> {
  const profile = await apiGet<UserProfile>('/me/profile');
  return {
    userId: profile.userId ?? profile.id,
    displayName: profile.displayName,
    email: profile.email,
    roles: profile.roles ?? [],
  };
}

export const restBackend: Backend = {
  kind: 'rest',

  // --- Authentication -----------------------------------------------------

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      await cognitoGetCurrentUser();
    } catch {
      return null;
    }
    try {
      return await loadAuthUser();
    } catch {
      // Signed in to Cognito but the API is unreachable or the token is stale.
      // Reporting "not signed in" is better than leaving the app half-loaded.
      return null;
    }
  },

  async signUp(input: SignUpInput): Promise<SignUpResult> {
    const displayName = validateDisplayName(input.displayName);
    const email = validateEmail(input.email);
    validatePassword(input.password);

    if (input.roles.length === 0) {
      throw new DomainError(
        DomainErrorCode.VALIDATION,
        'Choose whether you want to learn, tutor, or both.',
        'roles',
      );
    }

    try {
      const result = await cognitoSignUp({
        username: email,
        password: input.password,
        options: { userAttributes: { email, name: displayName } },
      });

      stashPending(input.roles, input.institution);

      return {
        needsConfirmation: !result.isSignUpComplete,
        user: null,
        email,
      };
    } catch (error) {
      translateAuthError(error);
    }
  },

  async confirmSignUp(email: string, code: string, password?: string) {
    try {
      await cognitoConfirmSignUp({ username: email, confirmationCode: code.trim() });
    } catch (error) {
      translateAuthError(error);
    }

    // Sign straight in when the password is still held, so confirmation does not
    // dead-end on a second login form.
    if (password) return this.signIn(email, password);
    return null;
  },

  async resendConfirmationCode(email: string) {
    try {
      await resendSignUpCode({ username: email });
    } catch (error) {
      translateAuthError(error);
    }
  },

  async signIn(email: string, password: string): Promise<AuthUser> {
    try {
      const result = await cognitoSignIn({
        username: email.trim().toLowerCase(),
        password,
      });
      if (!result.isSignedIn) {
        throw new DomainError(
          DomainErrorCode.VALIDATION,
          'Additional verification is required to sign in.',
        );
      }
    } catch (error) {
      if (error instanceof DomainError) throw error;
      translateAuthError(error);
    }

    const user = await loadAuthUser();

    // Apply the roles chosen at registration on first successful sign-in.
    const pending = takePending();
    if (pending?.roles?.length) {
      const merged = [...new Set([...user.roles, ...pending.roles])];
      const changed =
        merged.length !== user.roles.length || Boolean(pending.institution);
      if (changed) {
        const updated = await apiSend<UserProfile>('/me/profile', 'PUT', {
          roles: merged,
          ...(pending.institution ? { institution: pending.institution } : {}),
        });
        return {
          userId: updated.userId ?? updated.id,
          displayName: updated.displayName,
          email: updated.email,
          roles: updated.roles ?? merged,
        };
      }
    }

    return user;
  },

  async signOut() {
    await cognitoSignOut();
  },

  // --- Profiles -----------------------------------------------------------

  async getMyUserProfile() {
    try {
      await cognitoGetCurrentUser();
    } catch {
      return null;
    }
    return apiGet<UserProfile>('/me/profile');
  },

  async updateMyUserProfile(input: UpdateUserProfileInput) {
    return apiSend<UserProfile>('/me/profile', 'PUT', input);
  },

  async getMyTutorProfile() {
    try {
      await cognitoGetCurrentUser();
    } catch {
      return null;
    }
    return apiGet<TutorProfile | null>('/me/tutor-profile');
  },

  async saveMyTutorProfile(input: TutorProfileInput) {
    return apiSend<TutorProfile>('/me/tutor-profile', 'PUT', input);
  },

  // --- Discovery ----------------------------------------------------------

  async listTutorListings() {
    return publicGet<TutorListing[]>('/tutors');
  },

  async getTutorListing(tutorProfileId: string) {
    return publicGet<TutorListing | null>(`/tutors/${encodeURIComponent(tutorProfileId)}`);
  },

  // --- Availability -------------------------------------------------------

  async listSlotsForTutor(tutorProfileId: string) {
    const slots = await publicGet<AvailabilitySlot[]>(
      `/tutors/${encodeURIComponent(tutorProfileId)}/slots`,
    );
    return slots.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  },

  async listMySlots() {
    const slots = await apiGet<AvailabilitySlot[]>('/me/slots');
    return slots.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  },

  async createSlots(inputs: CreateSlotInput[]) {
    return apiSend<AvailabilitySlot[]>('/me/slots', 'POST', { slots: inputs });
  },

  async deleteSlot(slotId: string) {
    await apiSend<{ ok: boolean }>(`/me/slots/${encodeURIComponent(slotId)}`, 'DELETE');
  },

  // --- Sessions -----------------------------------------------------------

  async listMySessions() {
    const sessions = await apiGet<SessionView[]>('/me/sessions');
    return sessions.sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));
  },

  async getSession(sessionId: string) {
    return apiGet<SessionView | null>(`/sessions/${encodeURIComponent(sessionId)}`);
  },

  async bookSession(input: BookSessionInput) {
    return apiSend<SessionView>('/sessions', 'POST', input);
  },

  async respondToSession(sessionId: string, accept: boolean, meetingLink?: string) {
    return apiSend<SessionView>(
      `/sessions/${encodeURIComponent(sessionId)}/respond`,
      'POST',
      { accept, meetingLink: meetingLink ?? null },
    );
  },

  async cancelSession(sessionId: string) {
    return apiSend<SessionView>(`/sessions/${encodeURIComponent(sessionId)}/cancel`, 'POST');
  },

  async completeSession(sessionId: string) {
    return apiSend<SessionView>(
      `/sessions/${encodeURIComponent(sessionId)}/complete`,
      'POST',
    );
  },

  // --- Reviews ------------------------------------------------------------

  async listReviewsForTutor(tutorProfileId: string) {
    const reviews = await publicGet<Review[]>(
      `/tutors/${encodeURIComponent(tutorProfileId)}/reviews`,
    );
    return reviews.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  },

  async submitReview(sessionId: string, rating: number, comment: string) {
    return apiSend<Review>(`/sessions/${encodeURIComponent(sessionId)}/review`, 'POST', {
      rating,
      comment,
    });
  },

  // --- Messages -----------------------------------------------------------

  async listMessages(sessionId: string) {
    const messages = await apiGet<Message[]>(
      `/sessions/${encodeURIComponent(sessionId)}/messages`,
    );
    return messages.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  },

  async sendMessage(sessionId: string, body: string) {
    return apiSend<Message>(`/sessions/${encodeURIComponent(sessionId)}/messages`, 'POST', {
      body,
    });
  },

  // --- Notifications ------------------------------------------------------

  async listMyNotifications() {
    const items = await apiGet<AppNotification[]>('/me/notifications');
    return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  },

  async markNotificationRead(notificationId: string) {
    await apiSend(`/me/notifications/${encodeURIComponent(notificationId)}/read`, 'POST');
  },

  async markAllNotificationsRead() {
    await apiSend('/me/notifications/read-all', 'POST');
  },

  // --- Administration -----------------------------------------------------
  // These hit /api/*, so API Gateway rejects them outright without a valid Cognito
  // token, and the Lambda then rejects them unless the caller's stored record
  // carries the ADMIN role.

  async adminGetOverview() {
    return apiGet<AdminOverview>('/admin/overview');
  },

  async adminListUsers() {
    return apiGet<AdminUserSummary[]>('/admin/users');
  },

  async adminGetUser(userId: string) {
    return apiGet<AdminUserDetail>(`/admin/users/${encodeURIComponent(userId)}`);
  },

  async adminSetUserStatus(userId: string, status: AccountStatus) {
    return apiSend<AdminUserDetail>(
      `/admin/users/${encodeURIComponent(userId)}/status`,
      'POST',
      { status },
    );
  },

  async adminSetUserRoles(userId: string, roles: UserRole[]) {
    return apiSend<AdminUserDetail>(
      `/admin/users/${encodeURIComponent(userId)}/roles`,
      'POST',
      { roles },
    );
  },

  async adminListSessions() {
    return apiGet<AdminSessionRow[]>('/admin/sessions');
  },

  async adminListReviews() {
    return apiGet<AdminReviewRow[]>('/admin/reviews');
  },

  async adminDeleteReview(reviewId: string) {
    await apiSend(`/admin/reviews/${encodeURIComponent(reviewId)}`, 'DELETE');
  },

  async adminUnpublishTutor(tutorProfileId: string) {
    await apiSend(
      `/admin/tutors/${encodeURIComponent(tutorProfileId)}/unpublish`,
      'POST',
    );
  },
};
