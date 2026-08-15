import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { toUserMessage } from '../../../shared/domain/errors';
import type { SessionView } from '../../../shared/domain/types';
import { cn, pluralise } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ButtonLink, Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { SessionCard } from '../../components/sessions/SessionCard';
import { ReviewModal } from '../../components/sessions/ReviewModal';
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '../../components/ui/primitives';
import { CalendarIcon } from '../../components/ui/icons';

type TabKey = 'upcoming' | 'requests' | 'past' | 'all';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'requests', label: 'Requests' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' },
];

export function DashboardSessionsPage() {
  const { user, refreshNotifications } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const sessionsState = useAsync(() => api.listMySessions(), []);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Dialog state, kept per-action so a confirm cannot fire the wrong mutation.
  const [cancelTarget, setCancelTarget] = useState<SessionView | null>(null);
  const [completeTarget, setCompleteTarget] = useState<SessionView | null>(null);
  const [reviewTarget, setReviewTarget] = useState<SessionView | null>(null);
  const [acceptTarget, setAcceptTarget] = useState<SessionView | null>(null);
  const [meetingLink, setMeetingLink] = useState('');
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const tab = (searchParams.get('filter') as TabKey | null) ?? 'upcoming';
  const userId = user?.userId ?? '';
  const sessions = sessionsState.data ?? [];

  const filtered = useMemo(() => {
    const now = Date.now();
    switch (tab) {
      case 'requests':
        return sessions.filter((session) => session.status === 'PENDING');
      case 'past':
        return sessions.filter(
          (session) =>
            session.status === 'COMPLETED' ||
            session.status === 'CANCELLED' ||
            session.status === 'DECLINED' ||
            (session.status === 'CONFIRMED' && Date.parse(session.endAt) < now),
        );
      case 'all':
        return sessions;
      case 'upcoming':
      default:
        return sessions
          .filter(
            (session) =>
              (session.status === 'CONFIRMED' || session.status === 'PENDING') &&
              Date.parse(session.endAt) >= now,
          )
          .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
    }
  }, [sessions, tab]);

  const counts = useMemo(
    () => ({
      requests: sessions.filter(
        (session) => session.status === 'PENDING' && session.tutorUserId === userId,
      ).length,
    }),
    [sessions, userId],
  );

  function setTab(next: TabKey) {
    const params = new URLSearchParams(searchParams);
    if (next === 'upcoming') params.delete('filter');
    else params.set('filter', next);
    setSearchParams(params, { replace: true });
  }

  /** Wraps a mutation with busy state, error reporting and a reload. */
  async function run(
    sessionId: string,
    action: () => Promise<unknown>,
    successMessage: string,
  ) {
    setBusyId(sessionId);
    try {
      await action();
      sessionsState.reload();
      refreshNotifications();
      toast.success(successMessage);
      return true;
    } catch (error) {
      toast.error(toUserMessage(error));
      // Reload anyway: the failure usually means this client's view is stale.
      sessionsState.reload();
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function handleAccept() {
    if (!acceptTarget) return;

    if (meetingLink && !/^https:\/\/\S+$/i.test(meetingLink)) {
      setAcceptError('A meeting link must start with https://');
      return;
    }
    setAcceptError(null);

    const ok = await run(
      acceptTarget.id,
      () => api.respondToSession(acceptTarget.id, true, meetingLink || undefined),
      'Session confirmed.',
    );
    if (ok) {
      setAcceptTarget(null);
      setMeetingLink('');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Sessions</h1>
        <p className="mt-1 text-ink-600">
          Requests, confirmed sessions and your history.
        </p>
      </div>

      {/* Tabs. Horizontally scrollable on small screens rather than wrapping into
          an unstable two-row control. */}
      <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
        <div
          role="tablist"
          aria-label="Session filters"
          className="inline-flex gap-1 rounded-lg border border-ink-200 bg-white p-1"
        >
          {TABS.map((item) => (
            <button
              key={item.key}
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium',
                tab === item.key
                  ? 'bg-primary-600 text-white'
                  : 'text-ink-700 hover:bg-ink-100',
              )}
            >
              {item.label}
              {item.key === 'requests' && counts.requests > 0 ? (
                <span
                  className={cn(
                    'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    tab === item.key ? 'bg-white text-primary-800' : 'bg-amber-200 text-amber-950',
                  )}
                >
                  {counts.requests}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {sessionsState.loading ? (
        <ListSkeleton rows={3} />
      ) : sessionsState.error ? (
        <ErrorState message={sessionsState.error} onRetry={sessionsState.reload} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon />}
          title={
            tab === 'requests'
              ? 'No pending requests'
              : tab === 'past'
                ? 'No past sessions yet'
                : 'Nothing scheduled'
          }
          description={
            tab === 'past'
              ? 'Completed and cancelled sessions will be listed here.'
              : 'Once you request a session, or a student requests one of your times, it appears here.'
          }
          action={tab !== 'past' ? <ButtonLink to="/tutors">Find a tutor</ButtonLink> : undefined}
        />
      ) : (
        <>
          <p className="text-sm text-ink-600" aria-live="polite">
            {filtered.length} {pluralise(filtered.length, 'session')}
          </p>
          <ul className="space-y-3">
            {filtered.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                viewerUserId={userId}
                busy={busyId === session.id}
                actions={{
                  onAccept: () => {
                    setMeetingLink('');
                    setAcceptError(null);
                    setAcceptTarget(session);
                  },
                  onDecline: () =>
                    run(
                      session.id,
                      () => api.respondToSession(session.id, false),
                      'Request declined and the time is open again.',
                    ),
                  onCancel: () => setCancelTarget(session),
                  onComplete: () => setCompleteTarget(session),
                  onReview: () => setReviewTarget(session),
                }}
              />
            ))}
          </ul>
        </>
      )}

      {/* --- Accept, with an optional meeting link --- */}
      <Modal
        open={Boolean(acceptTarget)}
        onClose={() => {
          setAcceptTarget(null);
          setAcceptError(null);
        }}
        title="Confirm this session"
        description={
          acceptTarget
            ? `${acceptTarget.studentName} will be notified straight away.`
            : undefined
        }
        busy={busyId === acceptTarget?.id}
        size="sm"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => setAcceptTarget(null)}
              disabled={busyId === acceptTarget?.id}
            >
              Back
            </Button>
            <Button
              onClick={handleAccept}
              loading={busyId === acceptTarget?.id}
              loadingLabel="Confirming…"
            >
              Confirm session
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label="Meeting link (optional)"
            type="url"
            placeholder="https://…"
            value={meetingLink}
            onChange={(event) => setMeetingLink(event.target.value)}
            error={acceptError ?? undefined}
            hint="For online sessions. You can add or change this later by cancelling and rebooking, so only add it if you have it now."
          />
          <p className="text-sm text-ink-600">
            Confirming holds this time. If you cannot make it later, cancel so the slot
            reopens for someone else.
          </p>
        </div>
      </Modal>

      {/* --- Cancel --- */}
      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        busy={busyId === cancelTarget?.id}
        danger
        title="Cancel this session?"
        confirmLabel="Cancel session"
        message={
          cancelTarget
            ? `This cannot be undone. ${
                cancelTarget.tutorUserId === userId
                  ? cancelTarget.studentName
                  : cancelTarget.tutorName
              } will be notified and the time becomes available again.`
            : ''
        }
        onConfirm={async () => {
          if (!cancelTarget) return;
          const ok = await run(
            cancelTarget.id,
            () => api.cancelSession(cancelTarget.id),
            'Session cancelled.',
          );
          if (ok) setCancelTarget(null);
        }}
      />

      {/* --- Complete --- */}
      <ConfirmDialog
        open={Boolean(completeTarget)}
        onClose={() => setCompleteTarget(null)}
        busy={busyId === completeTarget?.id}
        title="Mark this session complete?"
        confirmLabel="Mark complete"
        message={
          completeTarget
            ? `This confirms the session went ahead and lets ${completeTarget.studentName} leave a review. It cannot be undone.`
            : ''
        }
        onConfirm={async () => {
          if (!completeTarget) return;
          const ok = await run(
            completeTarget.id,
            () => api.completeSession(completeTarget.id),
            'Session marked complete.',
          );
          if (ok) setCompleteTarget(null);
        }}
      />

      {/* --- Review --- */}
      <ReviewModal
        open={Boolean(reviewTarget)}
        onClose={() => setReviewTarget(null)}
        session={reviewTarget}
        onSubmitted={() => {
          setReviewTarget(null);
          sessionsState.reload();
          toast.success('Thanks. Your review is now on their profile.');
        }}
      />
    </div>
  );
}
