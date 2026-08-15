/**
 * Presentational primitives: cards, badges, avatars, ratings, and the loading,
 * empty and error states that every async surface is required to implement.
 */

import type { ReactNode } from 'react';
import { cn, avatarTint, initials, pluralise, ratingLabel } from '../../lib/utils';
import { AlertIcon, StarIcon } from './icons';
import { Button } from './Button';
import type { SessionStatus } from '../../../shared/domain/types';

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function Card({
  children,
  className,
  as: As = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'article' | 'section' | 'li';
}) {
  return (
    <As
      className={cn(
        'rounded-xl border border-ink-200 bg-white shadow-card',
        className,
      )}
    >
      {children}
    </As>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('p-4 sm:p-5', className)}>{children}</div>;
}

export function SectionHeading({
  title,
  description,
  action,
  level = 2,
  id,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  level?: 1 | 2 | 3;
  id?: string;
}) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3';
  const size =
    level === 1 ? 'text-2xl sm:text-3xl' : level === 2 ? 'text-xl' : 'text-lg';

  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <Tag id={id} className={size}>
          {title}
        </Tag>
        {description ? (
          <p className="mt-1 max-w-2xl text-ink-600">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

type BadgeTone = 'neutral' | 'primary' | 'pending' | 'success' | 'danger' | 'info';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-ink-100 text-ink-700 border-ink-200',
  primary: 'bg-primary-50 text-primary-800 border-primary-200',
  // Amber is reserved for "needs action" and never used decoratively.
  pending: 'bg-amber-50 text-amber-900 border-amber-300',
  success: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  danger: 'bg-rose-50 text-rose-900 border-rose-300',
  info: 'bg-sky-50 text-sky-900 border-sky-200',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_PRESENTATION: Record<SessionStatus, { tone: BadgeTone; label: string }> = {
  PENDING: { tone: 'pending', label: 'Awaiting response' },
  CONFIRMED: { tone: 'success', label: 'Confirmed' },
  COMPLETED: { tone: 'neutral', label: 'Completed' },
  DECLINED: { tone: 'danger', label: 'Declined' },
  CANCELLED: { tone: 'danger', label: 'Cancelled' },
};

/** Status is never colour-only: the badge always carries its text label. */
export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const { tone, label } = STATUS_PRESENTATION[status];
  return <Badge tone={tone}>{label}</Badge>;
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-11 w-11 text-sm',
    lg: 'h-16 w-16 text-lg',
  };

  return (
    <span
      // Decorative: the name is always rendered as text next to the avatar.
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        sizes[size],
        avatarTint(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Rating
// ---------------------------------------------------------------------------

export function Rating({
  value,
  count,
  size = 'sm',
  showCount = true,
}: {
  value: number | null;
  count: number;
  size?: 'sm' | 'md';
  showCount?: boolean;
}) {
  // AC-16: an unrated tutor says so, rather than showing zero stars.
  if (value === null || count === 0) {
    return <span className="text-sm text-ink-500">No reviews yet</span>;
  }

  const starClass = size === 'sm' ? 'text-sm' : 'text-base';

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('inline-flex text-amber-500', starClass)} aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => (
          <StarIcon
            key={star}
            filled={value >= star}
            half={value < star && value > star - 1}
          />
        ))}
      </span>
      <span className={cn('font-medium text-ink-800', size === 'sm' ? 'text-sm' : 'text-base')}>
        {value.toFixed(1)}
      </span>
      {showCount ? (
        <span className="text-sm text-ink-500">
          ({count} {pluralise(count, 'review')})
        </span>
      ) : null}
      {/* Text equivalent for assistive technology. */}
      <span className="sr-only">{ratingLabel(value, count)}</span>
    </span>
  );
}

export function RatingInput({
  value,
  onChange,
  error,
}: {
  value: number;
  onChange: (value: number) => void;
  error?: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink-700">
        Your rating <span className="text-rose-600">*</span>
      </legend>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <label
            key={star}
            className={cn(
              'cursor-pointer rounded p-1 text-2xl transition-colors',
              'focus-within:ring-2 focus-within:ring-primary-600',
              star <= value ? 'text-amber-500' : 'text-ink-300 hover:text-amber-300',
            )}
          >
            <input
              type="radio"
              name="rating"
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              className="sr-only"
            />
            <StarIcon filled={star <= value} />
            <span className="sr-only">
              {star} {pluralise(star, 'star')}
            </span>
          </label>
        ))}
        <span className="ml-2 text-sm text-ink-600" aria-live="polite">
          {value > 0 ? `${value} of 5` : 'Not rated'}
        </span>
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-sm font-medium text-rose-700">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Loading, empty and error states
// ---------------------------------------------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-ink-200', className)} />;
}

/** Matches the tutor card layout so the grid does not jump when data lands. */
export function TutorCardSkeleton() {
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </CardBody>
    </Card>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <Card key={index}>
          <CardBody className="space-y-2.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-ink-600">
      <svg
        className="h-5 w-5 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Every empty state names the cause and offers the way out. */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-ink-300 bg-white px-6 py-12 text-center">
      {icon ? (
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-ink-100 text-xl text-ink-500">
          {icon}
        </div>
      ) : null}
      <p className="text-base font-semibold text-ink-900">{title}</p>
      {description ? (
        <p className="mx-auto mt-1.5 max-w-md text-ink-600">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Never a bare "something went wrong": states what failed and offers retry. */
export function ErrorState({
  title = 'That did not load',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-6 text-center"
    >
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-lg text-rose-700">
        <AlertIcon />
      </div>
      <p className="text-base font-semibold text-rose-900">{title}</p>
      <p className="user-text mx-auto mt-1 max-w-md text-rose-800">{message}</p>
      {onRetry ? (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Inline form-level error, distinct from a per-field error. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900"
    >
      <span className="mt-0.5 shrink-0 text-base" aria-hidden="true">
        <AlertIcon />
      </span>
      <span className="user-text">{message}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (candidate) =>
      candidate === 1 ||
      candidate === totalPages ||
      Math.abs(candidate - page) <= 1,
  );

  return (
    <nav aria-label="Search results pages" className="flex items-center justify-center gap-1.5">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
      >
        Previous
      </Button>

      <ul className="flex items-center gap-1">
        {pages.map((candidate, index) => {
          const previous = pages[index - 1];
          const gap = previous !== undefined && candidate - previous > 1;
          return (
            <li key={candidate} className="flex items-center gap-1">
              {gap ? (
                <span className="px-1 text-ink-400" aria-hidden="true">
                  …
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => onChange(candidate)}
                aria-current={candidate === page ? 'page' : undefined}
                className={cn(
                  'h-9 min-w-9 rounded-lg px-2.5 text-sm font-medium',
                  candidate === page
                    ? 'bg-primary-600 text-white'
                    : 'text-ink-700 hover:bg-ink-100',
                )}
              >
                {candidate}
                <span className="sr-only">{candidate === page ? ' (current page)' : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
      >
        Next
      </Button>
    </nav>
  );
}
