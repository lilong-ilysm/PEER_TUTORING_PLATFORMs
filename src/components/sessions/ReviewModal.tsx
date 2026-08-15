import { useState } from 'react';
import type { SessionView } from '../../../shared/domain/types';
import { LIMITS } from '../../../shared/domain/rules';
import { toUserMessage } from '../../../shared/domain/errors';
import { getSubjectName } from '../../../shared/domain/subjects';
import { api } from '../../lib/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Field';
import { FormError, RatingInput } from '../ui/primitives';

export function ReviewModal({
  open,
  onClose,
  session,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  session: SessionView | null;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [ratingError, setRatingError] = useState<string | undefined>();

  function reset() {
    setRating(0);
    setComment('');
    setFormError(null);
    setRatingError(undefined);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!session || submitting) return;

    // Checked here for an immediate message; the backend checks it again.
    if (rating < 1) {
      setRatingError('Choose a rating between 1 and 5 stars.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setRatingError(undefined);

    try {
      await api.submitReview(session.id, rating, comment);
      reset();
      onSubmitted();
    } catch (error) {
      setFormError(toUserMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Leave a review"
      description={
        session
          ? `How was your ${getSubjectName(session.subjectId)} session with ${session.tutorName}?`
          : undefined
      }
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
            Not now
          </Button>
          <Button
            type="submit"
            form="review-form"
            loading={submitting}
            loadingLabel="Publishing…"
          >
            Publish review
          </Button>
        </div>
      }
    >
      <form id="review-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormError message={formError} />

        <RatingInput value={rating} onChange={setRating} error={ratingError} />

        <Textarea
          label="Your review (optional)"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={LIMITS.reviewCommentMax}
          placeholder="What worked well? What could have been better? Specific feedback helps other students choose."
        />

        <p className="text-sm text-ink-500">
          Your review appears publicly on this tutor's profile with your name, and can
          only be left once per session.
        </p>
      </form>
    </Modal>
  );
}
