/**
 * Subject catalogue.
 *
 * A fixed, controlled vocabulary. Search is meaningless without one: free-text
 * subjects produce "Maths", "maths", "Mathematics" and "Math" as four different
 * things, and no filter can reconcile them.
 *
 * Immutable in v1, which is what makes it safe to reference subjects by id
 * everywhere and resolve names for display, with no denormalisation drift.
 */

import type { AcademicLevel, SessionMode, Subject, UserRole } from './types';

export const SUBJECTS: Subject[] = [
  { id: 'maths', name: 'Mathematics', category: 'Mathematics & Statistics' },
  { id: 'further-maths', name: 'Further Mathematics', category: 'Mathematics & Statistics' },
  { id: 'statistics', name: 'Statistics', category: 'Mathematics & Statistics' },
  { id: 'physics', name: 'Physics', category: 'Natural Sciences' },
  { id: 'chemistry', name: 'Chemistry', category: 'Natural Sciences' },
  { id: 'biology', name: 'Biology', category: 'Natural Sciences' },
  { id: 'computer-science', name: 'Computer Science', category: 'Computing' },
  { id: 'programming', name: 'Programming', category: 'Computing' },
  { id: 'data-structures', name: 'Data Structures & Algorithms', category: 'Computing' },
  { id: 'databases', name: 'Databases', category: 'Computing' },
  { id: 'economics', name: 'Economics', category: 'Social Sciences' },
  { id: 'accounting', name: 'Accounting', category: 'Business' },
  { id: 'business-studies', name: 'Business Studies', category: 'Business' },
  { id: 'psychology', name: 'Psychology', category: 'Social Sciences' },
  { id: 'english-literature', name: 'English Literature', category: 'Humanities' },
  { id: 'academic-writing', name: 'Academic Writing', category: 'Humanities' },
  { id: 'history', name: 'History', category: 'Humanities' },
  { id: 'spanish', name: 'Spanish', category: 'Languages' },
  { id: 'french', name: 'French', category: 'Languages' },
  { id: 'engineering-maths', name: 'Engineering Mathematics', category: 'Engineering' },
];

const SUBJECT_INDEX = new Map(SUBJECTS.map((subject) => [subject.id, subject]));

export function getSubject(id: string): Subject | undefined {
  return SUBJECT_INDEX.get(id);
}

export function getSubjectName(id: string): string {
  return SUBJECT_INDEX.get(id)?.name ?? 'Unknown subject';
}

export function resolveSubjects(ids: string[]): Subject[] {
  return ids
    .map((id) => SUBJECT_INDEX.get(id))
    .filter((subject): subject is Subject => Boolean(subject));
}

export function isValidSubjectId(id: string): boolean {
  return SUBJECT_INDEX.has(id);
}

export function subjectsByCategory(): { category: string; subjects: Subject[] }[] {
  const groups = new Map<string, Subject[]>();
  for (const subject of SUBJECTS) {
    const list = groups.get(subject.category) ?? [];
    list.push(subject);
    groups.set(subject.category, list);
  }
  return [...groups.entries()].map(([category, subjects]) => ({ category, subjects }));
}

// ---------------------------------------------------------------------------
// Enum display labels. Kept beside the catalogue so every screen renders the
// same wording for the same value.
// ---------------------------------------------------------------------------

export const LEVEL_LABELS: Record<AcademicLevel, string> = {
  HIGH_SCHOOL: 'High school',
  FOUNDATION: 'Foundation',
  UNDERGRADUATE: 'Undergraduate',
  POSTGRADUATE: 'Postgraduate',
};

export const LEVEL_ORDER: AcademicLevel[] = [
  'HIGH_SCHOOL',
  'FOUNDATION',
  'UNDERGRADUATE',
  'POSTGRADUATE',
];

export const MODE_LABELS: Record<SessionMode, string> = {
  ONLINE: 'Online',
  IN_PERSON: 'In person',
  EITHER: 'Online or in person',
};

export const MODE_ORDER: SessionMode[] = ['ONLINE', 'IN_PERSON', 'EITHER'];

export const ROLE_LABELS: Record<UserRole, string> = {
  STUDENT: 'Learner',
  TUTOR: 'Tutor',
};

export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
