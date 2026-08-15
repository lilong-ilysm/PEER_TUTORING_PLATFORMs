import { Link } from 'react-router-dom';
import type { TutorListing } from '../../../shared/domain/types';
import { LEVEL_LABELS, MODE_LABELS } from '../../../shared/domain/subjects';
import {
  cn,
  formatDateTime,
  formatRatePerHour,
  pluralise,
  truncate,
} from '../../lib/utils';
import { Avatar, Badge, Card, CardBody, Rating } from '../ui/primitives';
import { ClockIcon, LocationIcon, VideoIcon } from '../ui/icons';

/**
 * The tutor card.
 *
 * Renders straight from `TutorListing`, the same object the profile page uses. That
 * is the mechanism behind AC-15: the card cannot show a different rating or rate
 * from the profile because both read the same fields of the same record.
 */
export function TutorCard({ listing }: { listing: TutorListing }) {
  const { tutorProfile: profile, user, subjects, openSlotCount, nextAvailableAt } = listing;

  const modeIcon =
    profile.sessionMode === 'IN_PERSON' ? (
      <LocationIcon />
    ) : profile.sessionMode === 'ONLINE' ? (
      <VideoIcon />
    ) : null;

  return (
    <Card as="article" className="flex h-full flex-col transition-shadow hover:shadow-pop">
      <CardBody className="flex min-w-0 flex-1 flex-col gap-3">
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
          </div>
          <div className="shrink-0 text-right">
            <p className="font-semibold text-ink-900">
              {formatRatePerHour(profile.hourlyRate, profile.currency)}
            </p>
          </div>
        </div>

        <p className="user-text text-sm text-ink-700">{truncate(profile.headline, 110)}</p>

        <ul className="flex flex-wrap gap-1.5">
          {subjects.slice(0, 3).map((subject) => (
            <li key={subject.id}>
              <Badge tone="primary">{subject.name}</Badge>
            </li>
          ))}
          {subjects.length > 3 ? (
            <li>
              <Badge>+{subjects.length - 3} more</Badge>
            </li>
          ) : null}
        </ul>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-600">
          <span className="inline-flex items-center gap-1.5">
            {modeIcon ? (
              <span className="text-base" aria-hidden="true">
                {modeIcon}
              </span>
            ) : null}
            {MODE_LABELS[profile.sessionMode]}
          </span>
          <span aria-hidden="true" className="text-ink-300">
            •
          </span>
          <span className="min-w-0 truncate">
            {profile.levels.map((level) => LEVEL_LABELS[level]).join(', ')}
          </span>
        </div>

        <div className="mt-auto space-y-3 pt-1">
          <Rating value={profile.ratingAvg} count={profile.ratingCount} />

          {/* Availability is stated only when it is real. */}
          <p
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm',
              openSlotCount > 0
                ? 'bg-emerald-50 text-emerald-900'
                : 'bg-ink-100 text-ink-600',
            )}
          >
            <span className="text-base" aria-hidden="true">
              <ClockIcon />
            </span>
            {openSlotCount > 0 && nextAvailableAt ? (
              <span className="min-w-0">
                Next free {formatDateTime(nextAvailableAt)}
                <span className="sr-only">
                  . {openSlotCount} open {pluralise(openSlotCount, 'slot')}
                </span>
              </span>
            ) : (
              <span>No open times right now</span>
            )}
          </p>

          <Link
            to={`/tutors/${profile.id}`}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-primary-600 font-medium text-white transition-colors hover:bg-primary-700"
          >
            View profile
            <span className="sr-only"> for {user.displayName}</span>
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
