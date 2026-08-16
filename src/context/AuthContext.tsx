/**
 * Session state.
 *
 * Holds the signed-in user, their profile records and their notifications, and
 * exposes the role predicates the route guards depend on. Everything routes
 * through the `api` proxy, so this file is identical whether the app is running
 * against AWS or in demo mode.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, type AuthUser, type SignUpInput, type SignUpResult } from '../lib/api';
import type { AppNotification, TutorProfile, UserProfile } from '../../shared/domain/types';

interface AuthContextValue {
  /** True until the initial session check settles, so guards do not flash. */
  initialising: boolean;
  user: AuthUser | null;
  profile: UserProfile | null;
  tutorProfile: TutorProfile | null;
  notifications: AppNotification[];
  unreadCount: number;

  isAuthenticated: boolean;
  isTutor: boolean;
  isStudent: boolean;
  /**
   * Drives what the interface renders, and nothing more. Access is granted or
   * refused by the server, which reads the caller's role from the database using the
   * identity in their verified token. Editing this value in a browser console
   * changes what is drawn and gains no data.
   */
  isAdmin: boolean;
  /** A tutor is only discoverable once the profile is complete and published. */
  hasPublishedTutorProfile: boolean;

  /** Returns the signed-in user so callers can route by role. */
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
  confirmSignUp: (email: string, code: string, password?: string) => Promise<void>;
  resendConfirmationCode: (email: string) => Promise<void>;
  signOut: () => Promise<void>;

  refreshProfiles: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialising, setInitialising] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tutorProfile, setTutorProfile] = useState<TutorProfile | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const loadProfiles = useCallback(async () => {
    const [nextProfile, nextTutorProfile] = await Promise.all([
      api.getMyUserProfile(),
      api.getMyTutorProfile(),
    ]);
    setProfile(nextProfile);
    setTutorProfile(nextTutorProfile);
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      setNotifications(await api.listMyNotifications());
    } catch {
      // A notification fetch failure must not break the page it sits on.
      setNotifications([]);
    }
  }, []);

  // Restore an existing session on first load.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const current = await api.getCurrentUser();
        if (cancelled) return;
        setUser(current);
        if (current) {
          await loadProfiles();
          await loadNotifications();
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setInitialising(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadProfiles, loadNotifications]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const next = await api.signIn(email, password);
      setUser(next);
      await loadProfiles();
      await loadNotifications();
      return next;
    },
    [loadProfiles, loadNotifications],
  );

  const signUp = useCallback(
    async (input: SignUpInput) => {
      const result = await api.signUp(input);
      // Demo mode signs the user straight in; AWS requires email confirmation
      // first, in which case `user` is null and the caller shows the code step.
      if (result.user) {
        setUser(result.user);
        await loadProfiles();
        await loadNotifications();
      }
      return result;
    },
    [loadProfiles, loadNotifications],
  );

  const confirmSignUp = useCallback(
    async (email: string, code: string, password?: string) => {
      const next = await api.confirmSignUp(email, code, password);
      if (next) {
        setUser(next);
        await loadProfiles();
        await loadNotifications();
      }
    },
    [loadProfiles, loadNotifications],
  );

  const resendConfirmationCode = useCallback(async (email: string) => {
    await api.resendConfirmationCode(email);
  }, []);

  const signOut = useCallback(async () => {
    await api.signOut();
    // Cleared locally as well as on the backend, so nothing authenticated
    // survives in memory for the back button to reveal (AC-7).
    setUser(null);
    setProfile(null);
    setTutorProfile(null);
    setNotifications([]);
  }, []);

  const markNotificationRead = useCallback(async (id: string) => {
    setNotifications((current) =>
      current.map((item) => (item.id === id ? { ...item, read: true } : item)),
    );
    await api.markNotificationRead(id);
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    await api.markAllNotificationsRead();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const roles = profile?.roles ?? user?.roles ?? [];
    return {
      initialising,
      user,
      profile,
      tutorProfile,
      notifications,
      unreadCount: notifications.filter((item) => !item.read).length,

      isAuthenticated: Boolean(user),
      isTutor: roles.includes('TUTOR'),
      isStudent: roles.includes('STUDENT'),
      isAdmin: roles.includes('ADMIN'),
      hasPublishedTutorProfile: Boolean(
        tutorProfile?.isPublished && tutorProfile.subjectIds.length > 0,
      ),

      signIn,
      signUp,
      confirmSignUp,
      resendConfirmationCode,
      signOut,
      refreshProfiles: loadProfiles,
      refreshNotifications: loadNotifications,
      markNotificationRead,
      markAllNotificationsRead,
    };
  }, [
    initialising,
    user,
    profile,
    tutorProfile,
    notifications,
    signIn,
    signUp,
    confirmSignUp,
    resendConfirmationCode,
    signOut,
    loadProfiles,
    loadNotifications,
    markNotificationRead,
    markAllNotificationsRead,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }
  return context;
}
