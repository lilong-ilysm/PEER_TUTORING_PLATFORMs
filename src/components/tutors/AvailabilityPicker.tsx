import type { AvailabilitySlot } from '../../../shared/domain/types';
import { isBookable } from '../../../shared/domain/rules';
import { cn, durationLabel, formatRelativeDay, formatSlotRange, groupByDay } from '../../lib/utils';
import { EmptyState } from '../ui/primitives';
import { CalendarIcon } from '../ui/icons';

/**
 * Availability display and slot selection.
 *
 * Only genuinely bookable slots are offered. Booked and past slots are filtered
 * out rather than shown greyed-out: a disabled slot invites the user to try
 * clicking it and then tells them no, which is worse than not showing it.
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

  if (bookable.length === 0) {
    return (
      <EmptyState
        icon={<CalendarIcon />}
        title="No open times at the moment"
        description="This tutor has not published any upcoming availability. Check back later, or browse other tutors who teach the same subject."
      />
    );
  }

  const days = groupByDay(bookable, (slot) => slot.startAt);

  return (
    <div className="space-y-4">
      {days.map(([dayKey, daySlots]) => (
        <div key={dayKey}>
          <h4 className="mb-2 text-sm font-semibold text-ink-700">
            {formatRelativeDay(daySlots[0]!.startAt)}
          </h4>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                      'flex h-auto w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1',
                      'disabled:cursor-not-allowed disabled:opacity-55',
                      selected
                        ? 'border-primary-600 bg-primary-50 text-primary-900'
                        : 'border-ink-300 bg-white text-ink-800 hover:border-primary-400 hover:bg-primary-50/40',
                    )}
                  >
                    <span className="text-sm font-medium">
                      {formatSlotRange(slot.startAt, slot.endAt)}
                    </span>
                    <span className="text-xs text-ink-500">
                      {durationLabel(slot.startAt, slot.endAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
