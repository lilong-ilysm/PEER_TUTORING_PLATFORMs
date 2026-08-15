import { useCallback, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { computeRatingAggregate } from '../../shared/domain/rules';
import { LEVEL_LABELS, MODE_LABELS } from '../../shared/domain/subjects';
import type { AvailabilitySlot } from '../../shared/domain/types';
import {
  formatRatePerHour,
  formatRelativeTimeAgo,
  pluralise,
} from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, ButtonLink } from '../components/ui/Button';
import {
  Avatar,
  Badge,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Rating,
  SectionHeading,
  Skeleton,
} from '../components/ui/primitives';
import { AvailabilityPicker } from '../components/tutors/AvailabilityPicker';
import { BookingModal } from '../components/sessions/BookingModal';
import { CalendarIcon, LocationIcon, VideoIcon } from '../components/ui/icons';

export function TutorProfilePage() {
  const { tutorId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const toast = useToast();

  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);

  const listingState = useAsync(() => api.getTutorListing(tutorId), [tutorId]);
  const slotsState = useAsync(() => api.listSlotsForTutor(tutorId), [tutorId]);
  const reviewsState = useAsync(() => api.listReviewsForTutor(tutorId), [tutorId]);

  const refreshAvailability = useCallback(() => {
    slotsState.reload();
    listingState.reload();
    setSelectedSlot(null);
  }, [slotsState, listingState]);

  const listing = listingState.data;
  const isOwnProfile = Boolean(listing && user && listing.user.id === user.userId);

  function handleBookIntent(slot: AvailabilitySlot) {
    setSelectedSlot(slot);

    // A guest is sent to sign in and returned to this exact profile (AC-5).
    if (!isAuthenticated) {
      navigate('/login', {
        state: { from: `${location.pathname}${location.search}` },
      });
      return;
    }
    setBookingOpen(true);
  }

  if (listingState.loading) {
    return (
      <div className="container-page py-8">
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ListSkeleton rows={3} />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (listingState.error) {
    return (
      <div className="container-page py-8">
        <ErrorState message={listingState.error} onRetry={listingState.reload} />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="container-page py-12">
        <EmptyState
          title="That tutor profile does not exist"
          description="The link may be out of date, or the tutor may have unpublished their profile."
          action={<ButtonLink to="/tutors">Browse tutors</ButtonLink>}
        />
      </div>
    );
  }

  const { tutorProfile: profile, subjects } = listing;
  const reviews = reviewsState.data ?? [];

  // AC-15: the rating shown here is recomputed from the reviews actually listed
  // below. If the stored aggregate ever drifted, this would surface it rather than
  // quietly displaying a stale number.
  const derived = computeRatingAggregate(reviews.map((review) => review.rating));
  const displayRating = reviewsState.data ? derived : {
    ratingAvg: profile.ratingAvg,
    ratingCount: profile.ratingCount,
  };

  const modeIcon =
    profile.sessionMode === 'IN_PERSON' ? <LocationIcon /> : <VideoIcon />;

  return (
    <div className="container-page py-6 lg:py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link to="/tutors" className="text-primary-700 underline-offset-2 hover:underline">
          ← Back to tutors
        </Link>
      </nav>

      {/* --- Header --- */}
      <Card>
        <CardBody className="sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <Avatar name={listing.user.displayName} size="lg" />

            <div className="min-w-0 flex-1">
              <h1 className="text-2xl">{listing.user.displayName}</h1>
              {listing.user.institution ? (
                <p className="mt-0.5 text-ink-600">{listing.user.institution}</p>
              ) : null}
              <p className="user-text mt-2 text-lg text-ink-800">{profile.headline}</p>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Rating value={displayRating.ratingAvg} count={displayRating.ratingCount} />
                <span className="inline-flex items-center gap-1.5 text-sm text-ink-700">
                  <span className="text-base text-ink-400" aria-hidden="true">
                    {modeIcon}
                  </span>
                  {MODE_LABELS[profile.sessionMode]}
                </span>
              </div>
            </div>

            <div className="shrink-0 sm:text-right">
              <p className="text-2xl font-semibold text-ink-900">
                {formatRatePerHour(profile.hourlyRate, profile.currency)}
              </p>
              {profile.hourlyRate === 0 ? (
                <p className="text-sm text-ink-600">Volunteer tutor</p>
              ) : null}
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* --- Main column --- */}
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="about-heading">
            <SectionHeading title="About" id="about-heading" />
            <Card>
              <CardBody>
                <p className="user-text whitespace-pre-line text-ink-800">{profile.bio}</p>
              </CardBody>
            </Card>
          </section>

          <section aria-labelledby="subjects-heading">
            <SectionHeading title="Subjects and levels" id="subjects-heading" />
            <Card>
              <CardBody className="space-y-4">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-ink-700">Subjects</h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {subjects.map((subject) => (
                      <li key={subject.id}>
                        <Link to={`/tutors?subject=${subject.id}`}>
                          <Badge tone="primary">{subject.name}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-ink-700">Levels</h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {profile.levels.map((level) => (
                      <li key={level}>
                        <Badge>{LEVEL_LABELS[level]}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardBody>
            </Card>
          </section>

          <section aria-labelledby="reviews-heading">
            <SectionHeading
              title={`Reviews${displayRating.ratingCount > 0 ? ` (${displayRating.ratingCount})` : ''}`}
              id="reviews-heading"
              description={
                displayRating.ratingCount > 0
                  ? 'Left only by students who completed a session with this tutor.'
                  : undefined
              }
            />

            {reviewsState.loading ? (
              <ListSkeleton rows={2} />
            ) : reviewsState.error ? (
              <ErrorState message={reviewsState.error} onRetry={reviewsState.reload} />
            ) : reviews.length === 0 ? (
              <EmptyState
                title="No reviews yet"
                description="This tutor has not been reviewed. That is not a bad sign, just a new one."
              />
            ) : (
              <ul className="space-y-3">
                {reviews.map((review) => (
                  <Card key={review.id} as="li" className="list-none">
                    <CardBody>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Rating value={review.rating} count={1} showCount={false} />
                        <span className="text-sm text-ink-500">
                          {formatRelativeTimeAgo(review.createdAt)}
                        </span>
                      </div>
                      {review.comment ? (
                        <p className="user-text mt-2 text-ink-800">{review.comment}</p>
                      ) : (
                        <p className="mt-2 text-sm italic text-ink-500">
                          Rating left without a written review.
                        </p>
                      )}
                    </CardBody>
                  </Card>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* --- Booking sidebar. Sticky on desktop. --- */}
        <aside className="min-w-0 scroll-mt-24" id="availability-anchor">
          <div className="lg:sticky lg:top-24">
            <Card>
              <CardBody>
                <h2 className="flex items-center gap-2 text-lg">
                  <span className="text-ink-400" aria-hidden="true">
                    <CalendarIcon />
                  </span>
                  Availability
                </h2>

                {isOwnProfile ? (
                  <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 p-3 text-sm text-ink-700">
                    <p>This is how your profile looks to students.</p>
                    <ButtonLink
                      to="/dashboard/availability"
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                    >
                      Manage availability
                    </ButtonLink>
                  </div>
                ) : null}

                <div className="mt-3">
                  {slotsState.loading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <div className="grid grid-cols-2 gap-2">
                        <Skeleton className="h-14" />
                        <Skeleton className="h-14" />
                        <Skeleton className="h-14" />
                        <Skeleton className="h-14" />
                      </div>
                    </div>
                  ) : slotsState.error ? (
                    <ErrorState message={slotsState.error} onRetry={slotsState.reload} />
                  ) : (
                    <AvailabilityPicker
                      slots={slotsState.data ?? []}
                      selectedSlotId={selectedSlot?.id ?? null}
                      onSelect={handleBookIntent}
                      disabled={isOwnProfile}
                    />
                  )}
                </div>

                {!isOwnProfile && (slotsState.data?.length ?? 0) > 0 ? (
                  <p className="mt-3 text-sm text-ink-600">
                    {isAuthenticated
                      ? 'Pick a time to send a request. Your tutor confirms before it is scheduled.'
                      : 'Pick a time to continue. You will be asked to sign in.'}
                  </p>
                ) : null}
              </CardBody>
            </Card>

            {listing.openSlotCount > 0 ? (
              <p className="mt-3 text-center text-sm text-ink-600">
                {listing.openSlotCount} open{' '}
                {pluralise(listing.openSlotCount, 'time')} in the next few weeks
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      <BookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        listing={listing}
        slot={selectedSlot}
        onBooked={({ conflict }) => {
          if (conflict) {
            // The slot list is stale; reload it so the taken time disappears.
            refreshAvailability();
            return;
          }
          setBookingOpen(false);
          refreshAvailability();
          toast.success('Request sent. You will be notified when the tutor responds.');
          navigate('/dashboard/sessions');
        }}
      />

      {/*
        Mobile action bar, so booking is reachable without scrolling back up.
        Offset above the bottom tab bar when signed in, otherwise the two fixed
        bars would sit on top of each other.
      */}
      {!isOwnProfile && listing.openSlotCount > 0 ? (
        <div
          className={
            isAuthenticated
              ? 'fixed inset-x-0 bottom-[4.5rem] z-30 border-t border-ink-200 bg-white p-3 lg:hidden'
              : 'fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white p-3 pb-safe lg:hidden'
          }
        >
          <div className="container-page flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-900">
                {formatRatePerHour(profile.hourlyRate, profile.currency)}
              </p>
              <p className="truncate text-xs text-ink-600">
                {listing.openSlotCount} open {pluralise(listing.openSlotCount, 'time')}
              </p>
            </div>
            <Button
              onClick={() => {
                document
                  .getElementById('availability-anchor')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="shrink-0"
            >
              See times
            </Button>
          </div>
        </div>
      ) : null}

      {/* Clears the mobile action bar so it never covers the last review. */}
      {!isOwnProfile && listing.openSlotCount > 0 ? (
        <div className="h-24 lg:hidden" aria-hidden="true" />
      ) : null}
    </div>
  );
}
