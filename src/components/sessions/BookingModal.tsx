import { useState } from 'react';
import type { AvailabilitySlot, TutorListing } from '../../../shared/domain/types';
import { LIMITS } from '../../../shared/domain/rules';
import { DomainErrorCode, extractErrorCode, toUserMessage } from '../../../shared/domain/errors';
import { getSubjectName } from '../../../shared/domain/subjects';
import { formatLongDate, formatSlotRange, durationLabel } from '../../lib/utils';
import { api } from '../../lib/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Field';
import { FormError } from '../ui/primitives';

/**
 * Booking request form.
 *
 * Note what this deliberately does *not* do: it never shows a success state before
 * the server has agreed. Under AC-20 the server is the only authority on who owns a
 * slot, so optimistic UI here would mean the interface occasionally lies about a
 * booking that did not happen.
 */
export function BookingModal({
  open,
  onClose,
  listing,
  slot,
  onBooked,
}: {
  open: boolean;
  onClose: () => void;
  listing: TutorListing;
  slot: AvailabilitySlot | null;
  /** Called after the server confirms. `conflict` asks the page to refresh slots. */
  onBooked: (result: { conflict: boolean }) => void;
}) {
  const [subjectId, setSubjectId] = useState(listing.subjectIds[0] ?? '');
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset() {
    setTopic('');
    setNote('');
    setFormError(null);
    setFieldErrors({});
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!slot || submitting) return;

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      await api.bookSession({ slotId: slot.id, subjectId, topic, note: note || undefined });
      reset();
      onBooked({ conflict: false });
    } catch (error) {
      const code = extractErrorCode(error);
      const message = toUserMessage(error);
      const field = (error as { field?: string })?.field;

      if (field) {
        setFieldErrors({ [field]: message });
      } else {
        setFormError(message);
      }

      // A lost race is not a form error: the slot list on the page is now stale,
      // so ask the page to reload availability.
      if (code === DomainErrorCode.SLOT_CONFLICT || code === DomainErrorCode.SLOT_IN_PAST) {
        onBooked({ conflict: true });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const subjectOptions = listing.subjects.map((subject) => ({
    value: subject.id,
    label: subject.name,
  }));

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Request this session"
      description={`${listing.user.displayName} will accept or decline your request.`}
      busy={submitting}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="booking-form"
            loading={submitting}
            loadingLabel="Sending request…"
          >
            Send request
          </Button>
        </div>
      }
    >
      {slot ? (
        <form id="booking-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
            <p className="font-medium text-ink-900">{formatLongDate(slot.startAt)}</p>
            <p className="text-sm text-ink-600">
              {formatSlotRange(slot.startAt, slot.endAt)} ·{' '}
              {durationLabel(slot.startAt, slot.endAt)}
            </p>
          </div>

          <FormError message={formError} />

          <Select
            label="Subject"
            required
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            options={subjectOptions}
            error={fieldErrors.subjectId}
            hint={
              subjectOptions.length === 1
                ? `${getSubjectName(subjectOptions[0]!.value)} is the only subject this tutor lists.`
                : undefined
            }
          />

          <Input
            label="What do you need help with?"
            required
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. Eigenvectors for my linear algebra coursework"
            maxLength={LIMITS.topicMax}
            error={fieldErrors.topic}
            hint="A specific topic lets your tutor prepare before you meet."
          />

          <Textarea
            label="Anything else? (optional)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={LIMITS.noteMax}
            placeholder="Share a problem sheet reference, or what you have already tried."
            error={fieldErrors.note}
          />
        </form>
      ) : (
        <p className="text-ink-600">Pick a time first.</p>
      )}
    </Modal>
  );
}
