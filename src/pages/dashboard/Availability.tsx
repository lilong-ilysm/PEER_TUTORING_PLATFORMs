import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { toUserMessage } from '../../../shared/domain/errors';
import { LIMITS } from '../../../shared/domain/rules';
import type { AvailabilitySlot } from '../../../shared/domain/types';
import {
  durationLabel,
  formatRelativeDay,
  formatSlotRange,
  groupByDay,
  pluralise,
  toDateTimeLocalValue,
} from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  FormError,
  ListSkeleton,
  SectionHeading,
} from '../../components/ui/primitives';
import { ClockIcon, PlusIcon, TrashIcon } from '../../components/ui/icons';

const DURATION_OPTIONS = [
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '1 hour' },
  { value: '90', label: '1 hour 30' },
  { value: '120', label: '2 hours' },
];

/** Next whole hour, at least the booking lead time away. */
function defaultStart(): string {
  const date = new Date(Date.now() + 2 * 3_600_000);
  date.setMinutes(0, 0, 0);
  return toDateTimeLocalValue(date);
}

export function DashboardAvailabilityPage() {
  const { tutorProfile, hasPublishedTutorProfile } = useAuth();
  const toast = useToast();

  const slotsState = useAsync(() => api.listMySlots(), []);
  const sessionsState = useAsync(() => api.listMySessions(), []);

  const [addOpen, setAddOpen] = useState(false);
  const [start, setStart] = useState(defaultStart);
  const [duration, setDuration] = useState('60');
  const [repeatWeeks, setRepeatWeeks] = useState('1');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AvailabilitySlot | null>(null);
  const [deleting, setDeleting] = useState(false);

  const slots = slotsState.data ?? [];

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    return {
      upcoming: slots
        .filter((slot) => Date.parse(slot.startAt) > now)
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
      past: slots.filter((slot) => Date.parse(slot.startAt) <= now),
    };
  }, [slots]);

  const openCount = upcoming.filter((slot) => slot.status === 'OPEN').length;
  const bookedCount = upcoming.filter((slot) => slot.status === 'BOOKED').length;

  /** Which session, if any, is holding a slot. Drives the delete guard messaging. */
  const holdingSession = useMemo(() => {
    const map = new Map<string, string>();
    for (const session of sessionsState.data ?? []) {
      if (session.status === 'PENDING' || session.status === 'CONFIRMED') {
        map.set(session.slotId, session.status);
      }
    }
    return map;
  }, [sessionsState.data]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setFormError(null);

    try {
      const minutes = Number(duration);
      const weeks = Number(repeatWeeks);
      const first = new Date(start);

      if (Number.isNaN(first.getTime())) {
        setFormError('Pick a valid date and time.');
        return;
      }

      // Weekly repeats are generated client-side and validated server-side, one
      // slot at a time, so a single bad occurrence cannot silently corrupt a batch.
      const inputs = Array.from({ length: weeks }, (_, index) => {
        const slotStart = new Date(first.getTime() + index * 7 * 86_400_000);
        const slotEnd = new Date(slotStart.getTime() + minutes * 60_000);
        return { startAt: slotStart.toISOString(), endAt: slotEnd.toISOString() };
      });

      const created = await api.createSlots(inputs);
      slotsState.reload();
      setAddOpen(false);
      toast.success(
        `${created.length} ${pluralise(created.length, 'time')} published.`,
      );
    } catch (error) {
      setFormError(toUserMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteSlot(deleteTarget.id);
      slotsState.reload();
      setDeleteTarget(null);
      toast.success('Time removed.');
    } catch (error) {
      toast.error(toUserMessage(error));
      slotsState.reload();
      sessionsState.reload();
    } finally {
      setDeleting(false);
    }
  }

  // A tutor with no profile cannot have availability, and saying so beats an empty
  // page with a disabled button.
  if (!tutorProfile) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl">Availability</h1>
        <EmptyState
          icon={<ClockIcon />}
          title="Create your tutor profile first"
          description="Availability belongs to a tutor profile. Add your subjects, levels and a description, then come back to publish times."
          action={<ButtonLink to="/dashboard/profile">Set up tutor profile</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        level={1}
        title="Availability"
        description="Publish the times you are genuinely free. Students can only request these."
        action={
          <Button onClick={() => { setStart(defaultStart()); setAddOpen(true); }}>
            <PlusIcon />
            Add times
          </Button>
        }
      />

      {!hasPublishedTutorProfile ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-amber-950">
          <p>
            Your profile is not published yet, so these times are not visible to
            students.{' '}
            {/* Client-side link: a bare anchor would full-reload the SPA. */}
            <Link
              to="/dashboard/profile"
              className="font-semibold underline underline-offset-2"
            >
              Publish your profile
            </Link>
            .
          </p>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: 'Open', value: openCount },
          { label: 'Booked', value: bookedCount },
          { label: 'Upcoming total', value: upcoming.length },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardBody className="p-4">
              <dt className="text-sm text-ink-600">{stat.label}</dt>
              <dd className="mt-0.5 text-2xl font-semibold text-ink-900">
                {slotsState.loading ? '—' : stat.value}
              </dd>
            </CardBody>
          </Card>
        ))}
      </dl>

      {slotsState.loading ? (
        <ListSkeleton rows={3} />
      ) : slotsState.error ? (
        <ErrorState message={slotsState.error} onRetry={slotsState.reload} />
      ) : upcoming.length === 0 ? (
        <EmptyState
          icon={<ClockIcon />}
          title="No upcoming times published"
          description="Nobody can book you until you publish availability. Add a few times this week to get started."
          action={
            <Button onClick={() => { setStart(defaultStart()); setAddOpen(true); }}>
              Add times
            </Button>
          }
        />
      ) : (
        // Grouped by day on every breakpoint: a seven-column week grid is unusable
        // at 375px, so it is not attempted.
        <div className="space-y-5">
          {groupByDay(upcoming, (slot) => slot.startAt).map(([dayKey, daySlots]) => (
            <section key={dayKey}>
              <h2 className="mb-2 text-base font-semibold text-ink-800">
                {formatRelativeDay(daySlots[0]!.startAt)}
              </h2>
              <ul className="space-y-2">
                {daySlots.map((slot) => {
                  const held = holdingSession.get(slot.id);
                  return (
                    <Card key={slot.id} as="li" className="list-none">
                      <CardBody className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                        <div className="min-w-0">
                          <p className="font-medium text-ink-900">
                            {formatSlotRange(slot.startAt, slot.endAt)}
                          </p>
                          <p className="text-sm text-ink-500">
                            {durationLabel(slot.startAt, slot.endAt)}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {slot.status === 'BOOKED' ? (
                            <Badge tone={held === 'PENDING' ? 'pending' : 'success'}>
                              {held === 'PENDING' ? 'Request pending' : 'Booked'}
                            </Badge>
                          ) : (
                            <Badge tone="primary">Open</Badge>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget(slot)}
                            // AC-17: a booked slot cannot be deleted, and the
                            // reason is stated rather than the button silently
                            // failing.
                            disabled={slot.status === 'BOOKED'}
                            title={
                              slot.status === 'BOOKED'
                                ? 'Cancel the session first to free this time'
                                : 'Remove this time'
                            }
                            className="text-rose-700 hover:bg-rose-50"
                          >
                            <TrashIcon />
                            <span className="sr-only">
                              Remove {formatSlotRange(slot.startAt, slot.endAt)}
                            </span>
                          </Button>
                        </div>
                      </CardBody>
                    </Card>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {past.length > 0 ? (
        <p className="text-sm text-ink-500">
          {past.length} past {pluralise(past.length, 'time')} hidden.
        </p>
      ) : null}

      {/* --- Add times --- */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add availability"
        description="Times are in your own timezone."
        busy={saving}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="add-slot-form"
              loading={saving}
              loadingLabel="Publishing…"
            >
              Publish
            </Button>
          </div>
        }
      >
        <form id="add-slot-form" onSubmit={handleAdd} className="space-y-4" noValidate>
          <FormError message={formError} />

          <Input
            label="Starts"
            type="datetime-local"
            required
            value={start}
            onChange={(event) => setStart(event.target.value)}
            hint={`Must be at least ${LIMITS.bookingLeadMinutes} minutes from now.`}
          />

          <Select
            label="Length"
            required
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            options={DURATION_OPTIONS}
          />

          <Select
            label="Repeat weekly"
            value={repeatWeeks}
            onChange={(event) => setRepeatWeeks(event.target.value)}
            options={[
              { value: '1', label: 'Just this once' },
              { value: '2', label: 'For 2 weeks' },
              { value: '4', label: 'For 4 weeks' },
              { value: '8', label: 'For 8 weeks' },
            ]}
            hint="Creates the same time on the same weekday. Overlapping times are rejected."
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        busy={deleting}
        danger
        title="Remove this time?"
        confirmLabel="Remove"
        message={
          deleteTarget
            ? `${formatRelativeDay(deleteTarget.startAt)}, ${formatSlotRange(
                deleteTarget.startAt,
                deleteTarget.endAt,
              )} will no longer be offered to students.`
            : ''
        }
      />
    </div>
  );
}
