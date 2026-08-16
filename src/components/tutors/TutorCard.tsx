import { Link } from 'react-router-dom';
import type { TutorListing } from '../../../shared/domain/types';
import { LEVEL_LABELS, MODE_LABELS } from '../../../shared/domain/subjects';
import { cn, formatDateTime, formatRate, pluralise } from '../../lib/utils';
import { Avatar, Badge, Card, CardBody, Rating } from '../ui/primitives';
import { ClockIcon, LocationIcon, VideoIcon } from '../ui/icons';

/**
 * The tutor card.
 *
 * Ordered to answer "why should I choose this tutor?" in the order a student
 * actually asks it: who they are, whether they can be trusted, what they cover,
 * when they are free, what it costs.
 *
 * Rendered straight from `TutorListing`, the same object the profile page uses, so
 * the card and the profile cannot show different ratings, rates or subjects.
 *
 * Fields the data model does not have (course, year of study, profile photo) are
 * deliberately absent rather than invented. `Avatar` falls back to initials.
 */
export function TutorCard({ listing }: { listing: TutorListing }) {
  const { tutorProfile: profile, user, subjects, openSlotCount, nextAvailableAt } = listing;

  const modeIcon =
    profile.sessionMode === 'IN_PERSON' ? (
      <LocationIcon />
    ) : profile.sessionMode === 'ONLINE' ? (
      <VideoIcon />
    ) : null;

  const hasAvailability = openSlotCount > 0 && Boolean(nextAvailableAt);

  return (
    <Card
      as="article"
      className="group flex h-full flex-col transition-shadow hover:shadow-pop"
    >
      <CardBody className="flex min-w-0 flex-1 flex-col gap-3.5">
        {/* --- Identity --- */}
        <div className="flex items-start gap-3">
          <Avatar name={user.displayName} />

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-ink-900">
              <Link
                to={`/tutors/${profile.id}`}
                className="rounded underline-offset-2 hover:underline"
              >
                {user.displayName}
              </Link>
            </h3>
            {user.institution ? (
              <p className="truncate text-sm text-ink-500">{user.institution}</p>
            ) : null}
            {/* Credibility immediately under the name, not buried at the bottom. */}
            <div className="mt-1">
              <Rating value={profile.ratingAvg} count={profile.ratingCount} />
            </div>
          </div>
        </div>

        {/* --- What they cover --- */}
        {/*
          line-clamp rather than a JS character count: it adapts to the real column
          width instead of guessing, so nothing is cut mid-word at one breakpoint
          and left short at another.
        */}
        <p className="user-text line-clamp-2 text-sm leading-relaxed text-ink-700">
          {profile.headline}
        </p>

        <ul className="flex flex-wrap gap-1.5">
          {subjects.slice(0, 3).map((subject) => (
            <li key={subject.id}>
              <Badge tone="primary">{subject.name}</Badge>
            </li>
          ))}
          {subjects.length > 3 ? (
            <li>
              <Badge>
                +{subjects.length - 3} more
                <span className="sr-only"> subjects</span>
              </Badge>
            </li>
          ) : null}
        </ul>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-600">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {modeIcon ? (
              <span className="shrink-0 text-base text-ink-400" aria-hidden="true">
                {modeIcon}
              </span>
            ) : null}
            <span className="truncate">{MODE_LABELS[profile.sessionMode]}</span>
          </span>
          {profile.levels.length > 0 ? (
            <>
              <span aria-hidden="true" className="text-ink-300">
                ·
              </span>
              <span className="min-w-0 truncate">
                {profile.levels.map((level) => LEVEL_LABELS[level]).join(', ')}
              </span>
            </>
          ) : null}
        </div>

        {/* --- Availability and price, pinned to the bottom so cards align --- */}
        <div className="mt-auto space-y-3 pt-1">
          <p
            className={cn(
              'flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-sm',
              hasAvailability
                ? 'bg-emerald-50 text-emerald-900'
                : 'bg-ink-100 text-ink-600',
            )}
          >
            <span className="mt-0.5 shrink-0 text-base" aria-hidden="true">
              <ClockIcon />
            </span>
            {hasAvailability ? (
              <span className="min-w-0">
                Next free{' '}
                <span className="font-semibold">{formatDateTime(nextAvailableAt!)}</span>
                <span className="sr-only">
                  . {openSlotCount} open {pluralise(openSlotCount, 'slot')} in total
                </span>
              </span>
            ) : (
              <span>No open times right now</span>
            )}
          </p>

          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0">
              {profile.hourlyRate === 0 ? (
                <span className="font-semibold text-emerald-800">Free</span>
              ) : (
                <>
                  <span className="text-lg font-semibold text-ink-900">
                    {formatRate(profile.hourlyRate, profile.currency)}
                  </span>
                  <span className="text-sm text-ink-500"> / hour</span>
                </>
              )}
            </p>

            <Link
              to={`/tutors/${profile.id}`}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-primary-600 px-4 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
            >
              View profile
              <span className="sr-only"> for {user.displayName}</span>
            </Link>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
