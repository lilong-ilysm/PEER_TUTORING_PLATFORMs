import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { toUserMessage } from '../../../shared/domain/errors';
import type { AdminReviewRow } from '../../../shared/domain/types';
import { formatDate, pluralise } from '../../lib/utils';
import { useToast } from '../../context/ToastContext';
import { AdminPageHeader } from '../../components/admin/AdminLayout';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { ConfirmDialog } from '../../components/ui/Modal';
import {
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Rating,
} from '../../components/ui/primitives';
import { SearchIcon, StarIcon } from '../../components/ui/icons';

/**
 * Review moderation.
 *
 * An administrator can DELETE a review; they cannot edit its rating or its text.
 * That asymmetry is deliberate. Deleting is visible in the aggregate, which is
 * recomputed from the reviews that remain, so a tutor's displayed rating always
 * equals the mean of the reviews a visitor can actually read. Editing a score would
 * silently falsify the number the entire discovery experience is built on.
 */
export function AdminReviewsPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => api.adminListReviews(), []);

  const [query, setQuery] = useState('');
  const [rating, setRating] = useState('ALL');
  const [target, setTarget] = useState<AdminReviewRow | null>(null);
  const [busy, setBusy] = useState(false);

  const reviews = data ?? [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return reviews.filter((review) => {
      if (rating !== 'ALL' && review.rating !== Number(rating)) return false;
      if (!needle) return true;
      return `${review.tutorName} ${review.subjectName} ${review.comment}`
        .toLowerCase()
        .includes(needle);
    });
  }, [reviews, query, rating]);

  async function remove(review: AdminReviewRow) {
    setBusy(true);
    try {
      await api.adminDeleteReview(review.id);
      reload();
      toast.success('Review deleted and the tutor rating recalculated.');
      setTarget(null);
    } catch (caught) {
      toast.error(toUserMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="Reviews"
        description={
          loading
            ? 'Loading reviews…'
            : `${reviews.length} ${pluralise(reviews.length, 'review')}. Deleting one recalculates that tutor's rating.`
        }
      />

      <Card className="mb-4">
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Search"
            type="search"
            placeholder="Tutor, subject or review text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            leadingIcon={<SearchIcon />}
          />
          <Select
            label="Rating"
            value={rating}
            onChange={(event) => setRating(event.target.value)}
            options={[
              { value: 'ALL', label: 'All ratings' },
              { value: '1', label: '1 star' },
              { value: '2', label: '2 stars' },
              { value: '3', label: '3 stars' },
              { value: '4', label: '4 stars' },
              { value: '5', label: '5 stars' },
            ]}
          />
        </CardBody>
      </Card>

      <p className="mb-3 text-sm text-ink-600" aria-live="polite">
        {loading ? 'Searching…' : `Showing ${filtered.length} of ${reviews.length}`}
      </p>

      {loading ? (
        <ListSkeleton rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<StarIcon />}
          title="No reviews match these filters"
          description="No review has been written yet, or your filters exclude them all."
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((review) => (
            <Card key={review.id} as="li" className="list-none">
              <CardBody className="space-y-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">
                      <Link
                        to={`/tutors/${review.tutorProfileId}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {review.tutorName}
                      </Link>
                    </p>
                    <p className="text-sm text-ink-600">
                      {review.subjectName} · {formatDate(review.createdAt)}
                    </p>
                  </div>
                  <Rating value={review.rating} count={1} showCount={false} />
                </div>

                {review.comment ? (
                  <blockquote className="user-text rounded-lg bg-ink-50 p-3 text-sm text-ink-800">
                    {review.comment}
                  </blockquote>
                ) : (
                  <p className="text-sm italic text-ink-500">
                    Rating left without a written review.
                  </p>
                )}

                <div className="flex justify-end border-t border-ink-200 pt-2.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-rose-700"
                    disabled={busy}
                    onClick={() => setTarget(review)}
                  >
                    Delete review
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        busy={busy}
        danger
        title="Delete this review?"
        confirmLabel="Delete review"
        message={
          target
            ? `This permanently removes the review of ${target.tutorName}. Their rating will be recalculated from the remaining reviews, and the student becomes able to leave a replacement. This cannot be undone.`
            : ''
        }
        onConfirm={() => target && void remove(target)}
      />
    </div>
  );
}
