import type { AvailabilitySlot } from '../../../shared/domain/types';
import { isBookable } from '../../../shared/domain/rules';
import {
  cn,
  durationLabel,
  formatDayHeading,
  formatRelativeDay,
  formatSlotRange,
  groupByDay,
  pluralise,
} from '../../lib/utils';
import { EmptyState } from '../ui/primitives';
import { CalendarIcon, CheckIcon } from '../ui/icons';

/**
 * Availability display and slot selection.
 *
 * LAYOUT DECISION: one slot per full-width row, at every breakpoint.
 *
 * The previous version used a 2-3 column grid. Inside the tutor profile's ~20rem
 * sidebar that left roughly 130px per cell, which is narrower than the time range
 * it had to hold, so "3:00 PM – 4:00 PM" broke across four lines. Shrinking the
 * font would have hidden the symptom while making the most important information on
 * the card harder to read. A row gives the time the full width of the container and
 * leaves room for a real "Select" affordance.
 *
 * Only genuinely bookable slots are offered. Past and already-booked slots are
 * filtered out rather than shown disabled: a greyed-out slot invites a click and
 * then refuses it. Where slots were hidden because they are taken, that is stated,
 * because "this tutor is in demand" is useful information rather than an absence.
 */
export function AvailabilityPicker({
  slots,
  selectedSlotId,
  onSelect,
  disabled = false,
}: {
  slots: AvailabilitySlot[];
  selectedSlotId: string | null;
  onSelect: (slot: AvailabilitySlot) => void;
  disabled?: boolean;
}) {
  const now = new Date();

  const bookable = slots
    .filter((slot) => isBookable(slot, now))
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  // Real count of upcoming slots that exist but are already taken.
  const takenUpcoming = slots.filter(
    (slot) => slot.status === 'BOOKED' && Date.parse(slot.startAt) > now.getTime(),
  ).length;

  if (bookable.length === 0) {
    return (
      <EmptyState
        icon={<CalendarIcon />}
        title={
          takenUpcoming > 0 ? 'Fully booked at the moment' : 'No open times at the moment'
        }
        description={
          takenUpcoming > 0
            ? `Every upcoming session with this tutor is taken (${takenUpcoming} ${pluralise(
                takenUpcoming,
                'slot',
              )}). Check back later, or look at other tutors who teach the same subject.`
            : 'This tutor has not published any upcoming availability. Check back later, or browse other tutors who teach the same subject.'
        }
      />
    );
  }

  const days = groupByDay(bookable, (slot) => slot.startAt);

  return (
    <div>
      <p className="mb-3 text-sm text-ink-600">
        <span className="font-semibold text-ink-900">
          {bookable.length} open {pluralise(bookable.length, 'time')}
        </span>
        {takenUpcoming > 0 ? (
          <span> · {takenUpcoming} already booked</span>
        ) : null}
      </p>

      <div className="space-y-5">
        {days.map(([dayKey, daySlots]) => {
          const first = daySlots[0]!;
          const relative = formatRelativeDay(first.startAt);
          const heading = formatDayHeading(first.startAt);
          // Avoid "Today · Today" when the relative label is already the date.
          const showBoth = relative !== heading;

          return (
            <section key={dayKey} aria-label={`Available on ${heading}`}>
              <div className="mb-2 flex items-baseline gap-2 border-b border-ink-200 pb-1.5">
                <h4 className="text-sm font-semibold text-ink-900">
                  {showBoth ? relative : heading}
                </h4>
                {showBoth ? (
                  <span className="text-xs text-ink-500">{heading}</span>
                ) : null}
              </div>

              <ul className="space-y-2">
                {daySlots.map((slot) => {
                  const selected = slot.id === selectedSlotId;
                  return (
                    <li key={slot.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(slot)}
                        disabled={disabled}
                        aria-pressed={selected}
                        className={cn(
                          // min-h keeps the row a comfortable touch target on mobile.
                          'flex min-h-[3.25rem] w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1',
                          'disabled:cursor-not-allowed disabled:opacity-55',
                          selected
                            ? 'border-primary-600 bg-primary-50 ring-1 ring-primary-600'
                            : 'border-ink-300 bg-white hover:border-primary-400 hover:bg-primary-50/40',
                        )}
                      >
                        <span className="min-w-0">
                          <span
                            className={cn(
                              // nowrap + tabular-nums: the time can never break, and
                              // digits line up vertically down the list.
                              'block whitespace-nowrap text-[0.9375rem] font-semibold tabular-nums',
                              selected ? 'text-primary-900' : 'text-ink-900',
                            )}
                          >
                            {formatSlotRange(slot.startAt, slot.endAt)}
                          </span>
                          <span className="mt-0.5 block text-xs text-ink-500">
                            {durationLabel(slot.startAt, slot.endAt)}
                          </span>
                        </span>

                        <span
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold',
                            selected
                              ? 'bg-primary-600 text-white'
                              : 'bg-ink-100 text-ink-700',
                          )}
                        >
                          {selected ? (
                            <>
                              <CheckIcon aria-hidden="true" />
                              Selected
                            </>
                          ) : (
                            'Select'
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
