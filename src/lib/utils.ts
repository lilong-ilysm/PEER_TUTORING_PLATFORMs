/** Small presentation helpers. No business logic lives here. */

/** Joins class names, dropping falsy values. */
export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    // `numeric` not `2-digit`: "3:00 PM" rather than "03:00 PM". The leading zero
    // added ~8% to the width of every time range for no information, which was
    // enough to make ranges wrap inside narrow containers.
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)}, ${formatTime(iso)}`;
}

/**
 * A time range as one atomic string, e.g. "3:00 PM – 4:00 PM".
 *
 * The spaces around the en dash are NON-BREAKING (U+00A0). Combined with
 * `whitespace-nowrap` at the render site this makes it structurally impossible for
 * a time to break across lines, which is what previously produced the broken
 * looking "03:00 / PM - / 04:00 / PM".
 */
export function formatSlotRange(startAt: string, endAt: string): string {
  return `${formatTime(startAt)}\u00a0–\u00a0${formatTime(endAt)}`;
}

/** Weekday + date, e.g. "Tue, 18 Aug". Used for availability group headers. */
export function formatDayHeading(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** "Today", "Tomorrow", or a short date. Used for grouping headers. */
export function formatRelativeDay(iso: string): string {
  const target = new Date(iso);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfTarget = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  ).getTime();
  const diffDays = Math.round((startOfTarget - startOfToday) / DAY_MS);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return formatDate(iso);
}

export function formatRelativeTimeAgo(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso);
  const minutes = Math.round(diffMs / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;

  return formatDate(iso);
}

export function durationLabel(startAt: string, endAt: string): string {
  const minutes = Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
}

/** Groups items by calendar day, preserving order. */
export function groupByDay<T>(items: T[], getIso: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const iso = getIso(item);
    const key = new Date(iso).toDateString();
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.entries()];
}

/** Builds a `datetime-local` input value in the user's own timezone. */
export function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Numbers and text
// ---------------------------------------------------------------------------

export function formatRate(amount: number, currency = 'GBP'): string {
  if (amount === 0) return 'Free';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function formatRatePerHour(amount: number, currency = 'GBP'): string {
  return amount === 0 ? 'Free' : `${formatRate(amount, currency)}/hr`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

/**
 * Deterministic avatar tint from a name, so the same person is always the same
 * colour without storing one.
 */
export function avatarTint(seed: string): string {
  const palette = [
    'bg-primary-100 text-primary-800',
    'bg-amber-100 text-amber-900',
    'bg-emerald-100 text-emerald-900',
    'bg-sky-100 text-sky-900',
    'bg-violet-100 text-violet-900',
    'bg-rose-100 text-rose-900',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100_000;
  }
  return palette[hash % palette.length]!;
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Renders a rating for display and for assistive technology (AC-34). */
export function ratingLabel(ratingAvg: number | null, ratingCount: number): string {
  if (ratingAvg === null || ratingCount === 0) return 'No reviews yet';
  return `${ratingAvg.toFixed(1)} out of 5, ${ratingCount} ${pluralise(ratingCount, 'review')}`;
}
