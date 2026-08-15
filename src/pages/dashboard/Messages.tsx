import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { toUserMessage } from '../../../shared/domain/errors';
import { LIMITS } from '../../../shared/domain/rules';
import { getSubjectName } from '../../../shared/domain/subjects';
import type { Message, SessionView } from '../../../shared/domain/types';
import {
  cn,
  formatDateTime,
  formatRelativeTimeAgo,
  formatSlotRange,
  formatRelativeDay,
} from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button, ButtonLink } from '../../components/ui/Button';
import {
  Avatar,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  ListSkeleton,
  SessionStatusBadge,
} from '../../components/ui/primitives';
import { MessageIcon, SendIcon } from '../../components/ui/icons';

/**
 * Session-scoped messaging.
 *
 * Conversations exist per session rather than per person: "which library floor?"
 * belongs to a specific booking, and a shared thread across five sessions with the
 * same tutor loses that context.
 *
 * Messaging is only available once a session is confirmed, which is enforced by
 * `assertCanMessage` on the server as well as reflected here.
 */
export function DashboardMessagesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const sessionsState = useAsync(() => api.listMySessions(), []);
  const selectedId = searchParams.get('session');

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const conversations = useMemo(
    () =>
      (sessionsState.data ?? [])
        .filter(
          (session) => session.status === 'CONFIRMED' || session.status === 'COMPLETED',
        )
        .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt)),
    [sessionsState.data],
  );

  const selected = conversations.find((session) => session.id === selectedId) ?? null;

  const messagesState = useAsync<Message[]>(
    () => (selected ? api.listMessages(selected.id) : Promise.resolve([])),
    [selected?.id],
  );

  // Auto-select the newest conversation on desktop so the pane is not empty.
  useEffect(() => {
    if (selectedId || conversations.length === 0) return;
    if (window.matchMedia('(min-width: 1024px)').matches) {
      const params = new URLSearchParams(searchParams);
      params.set('session', conversations[0]!.id);
      setSearchParams(params, { replace: true });
    }
  }, [conversations, selectedId, searchParams, setSearchParams]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messagesState.data]);

  function selectConversation(session: SessionView) {
    const params = new URLSearchParams(searchParams);
    params.set('session', session.id);
    setSearchParams(params, { replace: true });
    setDraft('');
  }

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || sending) return;

    // Whitespace-only messages are rejected before a request is made (AC-30).
    if (draft.trim().length === 0) return;

    setSending(true);
    try {
      await api.sendMessage(selected.id, draft);
      setDraft('');
      messagesState.reload();
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setSending(false);
    }
  }

  const userId = user?.userId ?? '';

  if (sessionsState.loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl">Messages</h1>
        <ListSkeleton rows={3} />
      </div>
    );
  }

  if (sessionsState.error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl">Messages</h1>
        <ErrorState message={sessionsState.error} onRetry={sessionsState.reload} />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl">Messages</h1>
        <EmptyState
          icon={<MessageIcon />}
          title="No conversations yet"
          description="Messaging opens once a session is confirmed, so you always know who you are talking to and about which booking."
          action={<ButtonLink to="/tutors">Find a tutor</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl">Messages</h1>
        <p className="mt-1 text-ink-600">One conversation per confirmed session.</p>
      </div>

      <div className="lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-4">
        {/* Conversation list. Hidden on mobile once a thread is open, so the
            thread gets the whole screen. */}
        <div className={cn('min-w-0', selected && 'hidden lg:block')}>
          <ul className="space-y-2">
            {conversations.map((session) => {
              const isTutorView = session.tutorUserId === userId;
              const name = isTutorView ? session.studentName : session.tutorName;
              const active = session.id === selected?.id;

              return (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => selectConversation(session)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                      active
                        ? 'border-primary-600 bg-primary-50'
                        : 'border-ink-200 bg-white hover:bg-ink-50',
                    )}
                  >
                    <Avatar name={name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink-900">{name}</p>
                      <p className="truncate text-sm text-ink-600">
                        {getSubjectName(session.subjectId)}
                      </p>
                      <p className="truncate text-xs text-ink-500">
                        {formatRelativeDay(session.startAt)},{' '}
                        {formatSlotRange(session.startAt, session.endAt)}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Thread */}
        <div className={cn('min-w-0', !selected && 'hidden lg:block')}>
          {!selected ? (
            <Card>
              <CardBody>
                <p className="text-ink-600">Pick a conversation to read it.</p>
              </CardBody>
            </Card>
          ) : (
            <Card className="flex h-full flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 p-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const params = new URLSearchParams(searchParams);
                      params.delete('session');
                      setSearchParams(params, { replace: true });
                    }}
                    className="rounded-lg px-2 py-1 text-sm font-medium text-primary-700 hover:bg-ink-100 lg:hidden"
                  >
                    ← Back
                  </button>
                  <Avatar
                    name={
                      selected.tutorUserId === userId
                        ? selected.studentName
                        : selected.tutorName
                    }
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-900">
                      {selected.tutorUserId === userId
                        ? selected.studentName
                        : selected.tutorName}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {getSubjectName(selected.subjectId)} ·{' '}
                      {formatDateTime(selected.startAt)}
                    </p>
                  </div>
                </div>
                <SessionStatusBadge status={selected.status} />
              </div>

              <div className="min-h-[16rem] flex-1 space-y-3 overflow-y-auto p-3.5 lg:max-h-[26rem]">
                {messagesState.loading ? (
                  <ListSkeleton rows={2} />
                ) : messagesState.error ? (
                  <ErrorState
                    message={messagesState.error}
                    onRetry={messagesState.reload}
                  />
                ) : (messagesState.data ?? []).length === 0 ? (
                  <p className="py-8 text-center text-ink-500">
                    No messages yet. Say hello, or share what you want to cover.
                  </p>
                ) : (
                  (messagesState.data ?? []).map((message) => {
                    const mine = message.senderUserId === userId;
                    return (
                      <div
                        key={message.id}
                        className={cn('flex', mine ? 'justify-end' : 'justify-start')}
                      >
                        <div
                          className={cn(
                            'max-w-[85%] rounded-xl px-3 py-2',
                            mine
                              ? 'bg-primary-600 text-white'
                              : 'bg-ink-100 text-ink-900',
                          )}
                        >
                          <p className="user-text whitespace-pre-wrap text-sm">
                            {message.body}
                          </p>
                          <p
                            className={cn(
                              'mt-1 text-[11px]',
                              mine ? 'text-primary-100' : 'text-ink-500',
                            )}
                          >
                            {mine ? 'You' : 'Them'} ·{' '}
                            {formatRelativeTimeAgo(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={threadEndRef} />
              </div>

              {selected.status === 'CONFIRMED' || selected.status === 'COMPLETED' ? (
                <form
                  onSubmit={handleSend}
                  className="flex items-end gap-2 border-t border-ink-200 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <label htmlFor="message-body" className="sr-only">
                      Message
                    </label>
                    <textarea
                      id="message-body"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        // Enter sends; Shift+Enter makes a new line.
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void handleSend(event as unknown as React.FormEvent);
                        }
                      }}
                      rows={2}
                      maxLength={LIMITS.messageMax}
                      placeholder="Type a message…"
                      className="block w-full resize-none rounded-lg border border-ink-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary-600"
                    />
                    <p className="mt-1 text-right text-xs text-ink-500">
                      {draft.length} / {LIMITS.messageMax}
                    </p>
                  </div>
                  <Button
                    type="submit"
                    loading={sending}
                    loadingLabel="Sending"
                    disabled={draft.trim().length === 0}
                    className="mb-6 shrink-0"
                  >
                    <SendIcon />
                    <span className="sr-only sm:not-sr-only">Send</span>
                  </Button>
                </form>
              ) : (
                <p className="border-t border-ink-200 p-3.5 text-sm text-ink-600">
                  This session is closed, so messaging is no longer available.
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
