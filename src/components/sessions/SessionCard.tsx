import { Link } from 'react-router-dom';
import type { SessionView } from '../../../shared/domain/types';
import { getSubjectName, MODE_LABELS } from '../../../shared/domain/subjects';
import {
  durationLabel,
  formatLongDate,
  formatSlotRange,
} from '../../lib/utils';
import { Avatar, Badge, Card, CardBody, SessionStatusBadge } from '../ui/primitives';
import { Button } from '../ui/Button';
import { CalendarIcon, MessageIcon, VideoIcon } from '../ui/icons';

export interface SessionCardActions {
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
  onComplete?: () => void;
  onReview?: () => void;
}

/**
 * One session, from either side.
 *
 * The action set is derived from the same state machine the backend enforces, so
 * the UI only ever offers transitions that will actually be permitted. `busy`
 * disables everything during a write to stop double submissions.
 */
export function SessionCard({
  session,
  viewerUserId,
  actions,
  busy = false,
}: {
  session: SessionView;
  viewerUserId: string;
  actions?: SessionCardActions;
  busy?: boolean;
}) {
  const isTutorView = session.tutorUserId === viewerUserId;
  const counterpartName = isTutorView ? session.studentName : session.tutorName;
  const counterpartRole = isTutorView ? 'Learner' : 'Tutor';

  const isPast = Date.parse(session.startAt) <= Date.now();

  // Mirrors the ALLOWED_TRANSITIONS table plus the role checks in rules.ts.
  const canAccept = isTutorView && session.status === 'PENDING';
  const canDecline = isTutorView && session.status === 'PENDING';
  const canComplete = isTutorView && session.status === 'CONFIRMED' && isPast;
  const canCancel = session.status === 'PENDING' || session.status === 'CONFIRMED';
  const canReview = !isTutorView && session.status === 'COMPLETED' && !session.hasReview;
  const canMessage = session.status === 'CONFIRMED' || session.status === 'COMPLETED';

  return (
    <Card as="li" className="list-none">
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-3">
            <Avatar name={counterpartName} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink-900">{counterpartName}</p>
              <p className="text-sm text-ink-500">{counterpartRole}</p>
            </div>
          </div>
          <SessionStatusBadge status={session.status} />
        </div>

        <div className="space-y-1.5">
          <p className="flex items-start gap-2 text-sm text-ink-700">
            <span className="mt-0.5 shrink-0 text-base text-ink-400" aria-hidden="true">
              <CalendarIcon />
            </span>
            <span className="min-w-0">
              {formatLongDate(session.startAt)}, {formatSlotRange(session.startAt, session.endAt)}
              <span className="text-ink-500"> · {durationLabel(session.startAt, session.endAt)}</span>
            </span>
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="primary">{getSubjectName(session.subjectId)}</Badge>
            <Badge>{MODE_LABELS[session.mode]}</Badge>
          </div>

          <p className="user-text text-sm text-ink-800">
            <span className="font-medium">Topic: </span>
            {session.topic}
          </p>

          {session.note ? (
            <p className="user-text rounded-lg bg-ink-50 p-2.5 text-sm text-ink-700">
              {session.note}
            </p>
          ) : null}

          {session.status === 'CONFIRMED' && session.meetingLink ? (
            <p className="flex items-center gap-2 text-sm">
              <span className="text-base text-ink-400" aria-hidden="true">
                <VideoIcon />
              </span>
              <a
                href={session.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 break-all font-medium text-primary-700 underline underline-offset-2"
              >
                Join the meeting
              </a>
            </p>
          ) : null}

          {session.status === 'CANCELLED' ? (
            <p className="text-sm text-ink-600">
              Cancelled by{' '}
              {session.cancelledByUserId === viewerUserId ? 'you' : counterpartName}.
            </p>
          ) : null}

          {session.status === 'COMPLETED' && session.hasReview ? (
            <p className="text-sm text-ink-600">A review has been left for this session.</p>
          ) : null}
        </div>

        {actions ? (
          <div className="flex flex-wrap gap-2 border-t border-ink-200 pt-3">
            {canAccept && actions.onAccept ? (
              <Button size="sm" onClick={actions.onAccept} disabled={busy}>
                Accept
              </Button>
            ) : null}
            {canDecline && actions.onDecline ? (
              <Button size="sm" variant="secondary" onClick={actions.onDecline} disabled={busy}>
                Decline
              </Button>
            ) : null}
            {canComplete && actions.onComplete ? (
              <Button size="sm" onClick={actions.onComplete} disabled={busy}>
                Mark completed
              </Button>
            ) : null}
            {canReview && actions.onReview ? (
              <Button size="sm" onClick={actions.onReview} disabled={busy}>
                Leave a review
              </Button>
            ) : null}
            {canMessage ? (
              <Link
                to={`/dashboard/messages?session=${session.id}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-300 bg-white px-3 text-sm font-medium text-ink-800 hover:bg-ink-50"
              >
                <span aria-hidden="true">
                  <MessageIcon />
                </span>
                Messages
              </Link>
            ) : null}
            {canCancel && actions.onCancel ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={actions.onCancel}
                disabled={busy}
                className="text-rose-700 hover:bg-rose-50"
              >
                Cancel session
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
