/**
 * Demo data for local mode.
 *
 * The seeded tutors, slots and reviews are *demonstration* data, surfaced behind a
 * permanent banner (AC-43). They exist so the product can be reviewed and QA'd end
 * to end without an AWS account, not to inflate the product with fake numbers: the
 * landing page derives every count it shows from these records, so nothing on
 * screen is a claim that the data does not support.
 *
 * Slots are generated relative to "now" and topped up on load, so the demo never
 * degrades into a platform where every tutor is fully booked in the past.
 */

import { computeRatingAggregate } from '../../../../shared/domain/rules';
import type {
  AcademicLevel,
  AvailabilitySlot,
  Review,
  SessionMode,
  TutorProfile,
} from '../../../../shared/domain/types';
import { hashPassword, newId, newSalt, type LocalAccount, type LocalDb } from './db';
import { DEMO_PASSWORD } from '../../config';

export { DEMO_PASSWORD };

interface SeedTutor {
  displayName: string;
  email: string;
  institution: string;
  headline: string;
  bio: string;
  hourlyRate: number;
  sessionMode: SessionMode;
  levels: AcademicLevel[];
  subjectIds: string[];
  /** Ratings of the reviews to create, so aggregates are computed, never invented. */
  reviewRatings: number[];
  reviewComments: string[];
  /** Hours from "now" at which to open slots. */
  slotOffsets: number[];
}

const SEED_TUTORS: SeedTutor[] = [
  {
    displayName: 'Amara Okafor',
    email: 'amara@demo.peertutor.app',
    institution: 'Northgate University',
    headline: 'Third-year maths student, calculus and linear algebra',
    bio: 'I tutor first and second-year calculus, linear algebra and probability. I work through problems with you rather than lecturing, and I always start by finding out which step is actually causing the trouble. I sat the same modules two years ago, so I know which parts of the syllabus are genuinely hard and which just look hard.',
    hourlyRate: 18,
    sessionMode: 'EITHER',
    levels: ['UNDERGRADUATE', 'FOUNDATION'],
    subjectIds: ['maths', 'further-maths', 'statistics'],
    reviewRatings: [5, 5, 4, 5],
    reviewComments: [
      'Explained eigenvectors in a way that finally made sense. Went at my pace and did not make me feel slow.',
      'Really well prepared. She had worked through my problem sheet before we met.',
      'Helpful session. I would have liked a bit more time on the proof questions.',
      'Third session with Amara and my coursework mark went up a full grade.',
    ],
    slotOffsets: [26, 30, 50, 74, 98, 122],
  },
  {
    displayName: 'Daniel Reyes',
    email: 'daniel@demo.peertutor.app',
    institution: 'Northgate University',
    headline: 'CS finalist, data structures, algorithms and Python',
    bio: 'Final-year computer science. I help with data structures, algorithms, complexity analysis and Python or Java coursework. We can debug your actual code together, which tends to be far more useful than working through generic examples. Happy to do online sessions with screen sharing.',
    hourlyRate: 22,
    sessionMode: 'ONLINE',
    levels: ['UNDERGRADUATE', 'POSTGRADUATE'],
    subjectIds: ['computer-science', 'programming', 'data-structures', 'databases'],
    reviewRatings: [5, 4, 5],
    reviewComments: [
      'Found the bug in my recursion in about ten minutes and then made me explain it back to him. Good approach.',
      'Solid on algorithms. Slightly rushed at the end because we ran over.',
      'Helped me prepare for a technical interview and I got the placement.',
    ],
    slotOffsets: [28, 34, 52, 56, 100, 148],
  },
  {
    displayName: 'Priya Raman',
    email: 'priya@demo.peertutor.app',
    institution: 'Northgate University',
    headline: 'Chemistry postgrad, organic mechanisms and lab reports',
    bio: 'Postgraduate chemist. I cover organic mechanisms, thermodynamics and kinetics, and I am happy to read a draft lab report and tell you what a marker will actually pick up on. I prefer in-person sessions for mechanism work because drawing it out together makes a real difference.',
    hourlyRate: 25,
    sessionMode: 'IN_PERSON',
    levels: ['UNDERGRADUATE', 'POSTGRADUATE'],
    subjectIds: ['chemistry', 'biology'],
    reviewRatings: [5, 5],
    reviewComments: [
      'My lab report went from a 58 to a 71 after her feedback. Extremely specific and practical.',
      'Patient with mechanisms and did not mind me asking the same question twice.',
    ],
    slotOffsets: [48, 72, 96, 120],
  },
  {
    displayName: 'Tom Whitfield',
    email: 'tom@demo.peertutor.app',
    institution: 'Riverside College',
    headline: 'Economics and statistics, exam technique focused',
    bio: 'I tutor microeconomics, macroeconomics and the statistics that goes with them. A lot of economics marks are lost on exam technique rather than understanding, so I spend time on how to structure an answer and how to read what a question is actually asking for.',
    hourlyRate: 15,
    sessionMode: 'EITHER',
    levels: ['HIGH_SCHOOL', 'FOUNDATION', 'UNDERGRADUATE'],
    subjectIds: ['economics', 'statistics', 'business-studies'],
    reviewRatings: [4, 4, 5, 4, 5],
    reviewComments: [
      'Good on essay structure. Very practical advice about what examiners want.',
      'Clear explanations of elasticity. Session started a few minutes late.',
      'Turned my macro revision around completely.',
      'Knows the syllabus inside out.',
      'Really generous with his time and shared his own notes afterwards.',
    ],
    slotOffsets: [27, 33, 51, 75, 99, 123, 147],
  },
  {
    displayName: 'Sofia Marchetti',
    email: 'sofia@demo.peertutor.app',
    institution: 'Northgate University',
    headline: 'Academic writing and essay structure, all subjects',
    bio: 'I help with academic writing across any discipline: structuring an argument, referencing properly, tightening a paragraph that is doing too much. I also tutor Spanish conversation. English is my third language, so I have a lot of sympathy for anyone writing academically in a language they did not grow up with.',
    hourlyRate: 16,
    sessionMode: 'ONLINE',
    levels: ['UNDERGRADUATE', 'POSTGRADUATE', 'FOUNDATION'],
    subjectIds: ['academic-writing', 'english-literature', 'spanish'],
    reviewRatings: [5, 5, 5, 4],
    reviewComments: [
      'She restructured my introduction with me and the whole essay suddenly worked.',
      'Extremely kind and very good at explaining why a sentence is not clear.',
      'Best session I have had on this platform.',
      'Very helpful, though I needed a second session to cover everything.',
    ],
    slotOffsets: [29, 47, 53, 71, 95, 119],
  },
  {
    displayName: 'Marcus Bell',
    email: 'marcus@demo.peertutor.app',
    institution: 'Riverside College',
    headline: 'Physics and engineering maths, second year',
    bio: 'Second-year physics. I cover mechanics, waves, electromagnetism and the engineering mathematics that underpins them. I am fairly new to tutoring so my rate is low, and I would rather admit I need to check something than guess at an answer.',
    hourlyRate: 12,
    sessionMode: 'EITHER',
    levels: ['HIGH_SCHOOL', 'FOUNDATION', 'UNDERGRADUATE'],
    subjectIds: ['physics', 'engineering-maths', 'maths'],
    reviewRatings: [],
    reviewComments: [],
    slotOffsets: [31, 49, 55, 73, 121],
  },
  {
    displayName: 'Hannah Cole',
    email: 'hannah@demo.peertutor.app',
    institution: 'Northgate University',
    headline: 'Psychology, research methods and SPSS',
    bio: 'Psychology finalist specialising in research methods. If SPSS output is making no sense, or you cannot work out which test your data needs, that is exactly what I am useful for. I also help with dissertation methodology sections.',
    hourlyRate: 20,
    sessionMode: 'EITHER',
    levels: ['UNDERGRADUATE'],
    subjectIds: ['psychology', 'statistics', 'academic-writing'],
    reviewRatings: [5, 4],
    reviewComments: [
      'Walked me through an ANOVA twice until I could do it myself. Excellent.',
      'Very knowledgeable about methods. Would book again.',
    ],
    slotOffsets: [45, 69, 93, 117, 141],
  },
  {
    displayName: 'Yusuf Karim',
    email: 'yusuf@demo.peertutor.app',
    institution: 'Riverside College',
    headline: 'Accounting and financial reporting',
    bio: 'I tutor financial and management accounting: double entry, consolidations, ratio analysis and variance analysis. I work through past paper questions with you under something close to exam conditions, because that is where most people find out what they do not know.',
    hourlyRate: 21,
    sessionMode: 'IN_PERSON',
    levels: ['FOUNDATION', 'UNDERGRADUATE'],
    subjectIds: ['accounting', 'business-studies', 'economics'],
    reviewRatings: [4, 5, 4],
    reviewComments: [
      'Consolidations finally clicked. Thank you.',
      'Very patient and extremely organised.',
      'Good session, would have liked more past paper material to take away.',
    ],
    slotOffsets: [46, 70, 94, 118],
  },
];

const DEMO_STUDENT = {
  displayName: 'Jordan Blake',
  email: 'student@demo.peertutor.app',
  institution: 'Northgate University',
  bio: 'Second-year student. Currently trying to survive linear algebra.',
};

/** Rounds forward to the next exact hour, so demo slots look deliberate. */
function hoursFromNow(hours: number): Date {
  const date = new Date(Date.now() + hours * 3_600_000);
  date.setMinutes(0, 0, 0);
  return date;
}

function makeSlot(
  tutorProfileId: string,
  tutorUserId: string,
  hours: number,
): AvailabilitySlot {
  const start = hoursFromNow(hours);
  const end = new Date(start.getTime() + 60 * 60_000);
  return {
    id: newId(),
    tutorProfileId,
    tutorUserId,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    status: 'OPEN',
    sessionId: null,
  };
}

export async function seedDatabase(db: LocalDb): Promise<void> {
  const now = new Date().toISOString();
  const salt = newSalt();
  const passwordHash = await hashPassword(DEMO_PASSWORD, salt);

  // Demo learner account.
  const studentId = newId();
  db.accounts.push({
    id: studentId,
    // Demo mode has no separate identity provider, so the record id *is* the
    // identity. On AWS these differ: `userId` is the Cognito subject.
    userId: studentId,
    displayName: DEMO_STUDENT.displayName,
    email: DEMO_STUDENT.email,
    roles: ['STUDENT'],
    institution: DEMO_STUDENT.institution,
    bio: DEMO_STUDENT.bio,
    createdAt: now,
    passwordHash,
    salt,
    seeded: true,
  });

  for (const tutor of SEED_TUTORS) {
    const userId = newId();
    const tutorSalt = newSalt();
    const tutorHash = await hashPassword(DEMO_PASSWORD, tutorSalt);

    const account: LocalAccount = {
      id: userId,
      userId,
      displayName: tutor.displayName,
      email: tutor.email,
      roles: ['TUTOR', 'STUDENT'],
      institution: tutor.institution,
      bio: null,
      createdAt: now,
      passwordHash: tutorHash,
      salt: tutorSalt,
      seeded: true,
    };
    db.accounts.push(account);

    const profileId = newId();
    const { ratingAvg, ratingCount } = computeRatingAggregate(tutor.reviewRatings);

    const profile: TutorProfile = {
      id: profileId,
      userId,
      displayName: tutor.displayName,
      institution: tutor.institution,
      headline: tutor.headline,
      bio: tutor.bio,
      hourlyRate: tutor.hourlyRate,
      currency: 'GBP',
      sessionMode: tutor.sessionMode,
      levels: tutor.levels,
      subjectIds: tutor.subjectIds,
      isPublished: true,
      ratingAvg,
      ratingCount,
      createdAt: now,
      updatedAt: now,
    };
    db.tutorProfiles.push(profile);

    for (const offset of tutor.slotOffsets) {
      db.slots.push(makeSlot(profileId, userId, offset));
    }

    // Reviews are real records. The aggregate above is computed from them by the
    // same function the backend uses, so the profile and the review list agree.
    tutor.reviewRatings.forEach((rating, index) => {
      const daysAgo = (index + 1) * 9;
      const review: Review = {
        id: newId(),
        // Historic demo reviews are not attached to a live session record.
        sessionId: `seed-session-${profileId}-${index}`,
        tutorProfileId: profileId,
        studentUserId: studentId,
        rating,
        comment: tutor.reviewComments[index] ?? '',
        createdAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
      };
      db.reviews.push(review);
    });
  }

  db.seededAt = now;
}

/**
 * Keeps demo availability in the future. Without this, a demo database created
 * last week shows every tutor with no availability, which reads as a bug rather
 * than as stale sample data.
 */
export function topUpSeedAvailability(db: LocalDb): boolean {
  const now = Date.now();
  const horizon = now + 6 * 3_600_000;
  let changed = false;

  const seededUserIds = new Set(
    db.accounts.filter((account) => account.seeded).map((account) => account.id),
  );

  for (const profile of db.tutorProfiles) {
    if (!seededUserIds.has(profile.userId)) continue;

    const futureOpen = db.slots.filter(
      (slot) =>
        slot.tutorProfileId === profile.id &&
        slot.status === 'OPEN' &&
        Date.parse(slot.startAt) > horizon,
    );

    if (futureOpen.length >= 3) continue;

    // Spread replacements across the coming week at varied hours.
    const offsets = [26, 31, 50, 74, 99, 122];
    for (const offset of offsets.slice(0, 4)) {
      const candidate = makeSlot(profile.id, profile.userId, offset);
      const clashes = db.slots.some(
        (slot) =>
          slot.tutorProfileId === profile.id &&
          Date.parse(slot.startAt) < Date.parse(candidate.endAt) &&
          Date.parse(candidate.startAt) < Date.parse(slot.endAt),
      );
      if (!clashes) {
        db.slots.push(candidate);
        changed = true;
      }
    }
  }

  // Drop long-expired open slots so the availability views stay tidy.
  const cutoff = now - 7 * 86_400_000;
  const before = db.slots.length;
  db.slots = db.slots.filter(
    (slot) => slot.status === 'BOOKED' || Date.parse(slot.startAt) > cutoff,
  );
  if (db.slots.length !== before) changed = true;

  return changed;
}
