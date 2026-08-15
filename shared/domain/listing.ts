/**
 * Builds the canonical `TutorListing` used by the tutor card, the tutor profile
 * header and the search results.
 *
 * Extracted here because three backends now need it (demo, Amplify, REST/Lambda).
 * Keeping one implementation is what makes "the card and the profile always agree"
 * structurally true rather than a convention three files have to remember.
 */

import { resolveSubjects } from './subjects';
import type { AvailabilitySlot, TutorListing, TutorProfile } from './types';

export function buildListing(
  profile: TutorProfile,
  slots: AvailabilitySlot[],
  now: Date,
): TutorListing {
  const futureOpen = slots
    .filter(
      (slot) =>
        slot.tutorProfileId === profile.id &&
        slot.status === 'OPEN' &&
        Date.parse(slot.startAt) > now.getTime(),
    )
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  return {
    tutorProfile: profile,
    user: {
      id: profile.userId,
      displayName: profile.displayName,
      institution: profile.institution ?? null,
    },
    subjects: resolveSubjects(profile.subjectIds),
    subjectIds: profile.subjectIds,
    levels: profile.levels,
    openSlotCount: futureOpen.length,
    availableWeekdays: [
      ...new Set(futureOpen.map((slot) => new Date(slot.startAt).getDay())),
    ].sort((a, b) => a - b),
    nextAvailableAt: futureOpen[0]?.startAt ?? null,
  };
}
