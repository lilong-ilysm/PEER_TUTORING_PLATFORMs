/**
 * Browser-local persistence for demo mode.
 *
 * Everything lives in one JSON document under a single localStorage key, which
 * makes the read-modify-write in `mutate()` an effectively atomic critical section
 * within a tab: there is no `await` between reading and writing, so no other
 * handler can interleave. Cross-tab writes could still race, and that limitation
 * is documented in the README rather than hidden.
 */

import type {
  AppNotification,
  AvailabilitySlot,
  Message,
  Review,
  Session,
  TutorProfile,
  UserProfile,
} from '../../../../shared/domain/types';

export interface LocalAccount extends UserProfile {
  passwordHash: string;
  salt: string;
  /** Marks records created by the seeder, so they can be refreshed safely. */
  seeded?: boolean;
}

export interface LocalSession extends Session {
  tutorName: string;
  studentName: string;
  hasReview: boolean;
}

export interface LocalDb {
  version: number;
  seededAt: string;
  currentUserId: string | null;
  accounts: LocalAccount[];
  tutorProfiles: TutorProfile[];
  slots: AvailabilitySlot[];
  sessions: LocalSession[];
  reviews: Review[];
  messages: Message[];
  notifications: AppNotification[];
}

const STORAGE_KEY = 'peertutor.db.v1';
const DB_VERSION = 1;

export function emptyDb(): LocalDb {
  return {
    version: DB_VERSION,
    seededAt: new Date().toISOString(),
    currentUserId: null,
    accounts: [],
    tutorProfiles: [],
    slots: [],
    sessions: [],
    reviews: [],
    messages: [],
    notifications: [],
  };
}

let cache: LocalDb | null = null;

function canUseStorage(): boolean {
  try {
    const probe = '__peertutor_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    // Private browsing or a blocked-storage setting. The app still works for the
    // lifetime of the tab using the in-memory cache.
    return false;
  }
}

const storageAvailable = typeof window !== 'undefined' && canUseStorage();

export function readDb(): LocalDb {
  if (cache) return cache;

  if (storageAvailable) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LocalDb;
        if (parsed.version === DB_VERSION) {
          cache = parsed;
          return cache;
        }
        // A schema change invalidates the old demo document rather than
        // attempting a migration for throwaway data.
      }
    } catch (error) {
      console.warn('Demo data was unreadable and has been reset.', error);
    }
  }

  cache = emptyDb();
  writeDb(cache);
  return cache;
}

export function writeDb(next: LocalDb): void {
  cache = next;
  if (!storageAvailable) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('Could not persist demo data.', error);
  }
}

/**
 * Runs a synchronous critical section against the database. The callback must not
 * be async: that is what keeps the read-modify-write indivisible.
 */
export function mutate<T>(fn: (db: LocalDb) => T): T {
  const db = readDb();
  const result = fn(db);
  writeDb(db);
  return result;
}

export function resetDb(): void {
  cache = null;
  if (storageAvailable) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// Password hashing.
//
// Demo mode still should not store plaintext passwords: modelling bad practice in
// a reference implementation invites it into production. Real deployments use
// Cognito and never see a password at all.
// ---------------------------------------------------------------------------

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(`${salt}:${password}`);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return toHex(digest);
  }
  // Non-cryptographic last resort for environments without Web Crypto. Demo only.
  let hash = 0;
  const input = `${salt}:${password}`;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `fallback-${hash}`;
}

export function newSalt(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return toHex(bytes.buffer);
  }
  return Math.random().toString(36).slice(2);
}
