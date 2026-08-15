import { Link } from 'react-router-dom';
import type { NotificationType } from '../../../shared/domain/types';
import { cn, formatRelativeTimeAgo, pluralise } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import {
  Card,
  CardBody,
  EmptyState,
  SectionHeading,
} from '../../components/ui/primitives';
import {
  BellIcon,
  CalendarIcon,
  CheckIcon,
  CloseIcon,
  MessageIcon,
  StarIcon,
} from '../../components/ui/icons';

const ICONS: Record<NotificationType, { icon: JSX.Element; tint: string }> = {
  SESSION_REQUESTED: { icon: <CalendarIcon />, tint: 'bg-amber-100 text-amber-900' },
  SESSION_CONFIRMED: { icon: <CheckIcon />, tint: 'bg-emerald-100 text-emerald-900' },
  SESSION_DECLINED: { icon: <CloseIcon />, tint: 'bg-rose-100 text-rose-900' },
  SESSION_CANCELLED: { icon: <CloseIcon />, tint: 'bg-rose-100 text-rose-900' },
  SESSION_COMPLETED: { icon: <CheckIcon />, tint: 'bg-ink-100 text-ink-700' },
  REVIEW_RECEIVED: { icon: <StarIcon filled />, tint: 'bg-amber-100 text-amber-900' },
  MESSAGE_RECEIVED: { icon: <MessageIcon />, tint: 'bg-sky-100 text-sky-900' },
};

export function DashboardNotificationsPage() {
  const {
    notifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
  } = useAuth();

  return (
    <div className="space-y-5">
      <SectionHeading
        level={1}
        title="Notifications"
        description={
          unreadCount > 0
            ? `${unreadCount} unread ${pluralise(unreadCount, 'notification')}.`
            : 'You are up to date.'
        }
        action={
          unreadCount > 0 ? (
            <Button variant="secondary" size="sm" onClick={markAllNotificationsRead}>
              Mark all as read
            </Button>
          ) : undefined
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={<BellIcon />}
          title="Nothing here yet"
          description="You will be notified when someone requests a session, responds to a request, sends a message or leaves a review."
        />
      ) : (
        <ul className="space-y-2">
          {notifications.map((notification) => {
            const presentation = ICONS[notification.type];
            return (
              <Card
                key={notification.id}
                as="li"
                className={cn(
                  'list-none',
                  !notification.read && 'border-primary-300 bg-primary-50/40',
                )}
              >
                <CardBody className="flex items-start gap-3 p-3.5">
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base',
                      presentation.tint,
                    )}
                    aria-hidden="true"
                  >
                    {presentation.icon}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <p className="font-medium text-ink-900">{notification.title}</p>
                      <span className="text-xs text-ink-500">
                        {formatRelativeTimeAgo(notification.createdAt)}
                      </span>
                      {!notification.read ? (
                        <span className="rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          New
                        </span>
                      ) : null}
                    </div>
                    <p className="user-text mt-0.5 text-sm text-ink-700">
                      {notification.body}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-3">
                      <Link
                        to={notification.linkTo}
                        onClick={() => {
                          if (!notification.read) {
                            void markNotificationRead(notification.id);
                          }
                        }}
                        className="text-sm font-medium text-primary-700 underline-offset-2 hover:underline"
                      >
                        View
                      </Link>
                      {!notification.read ? (
                        <button
                          type="button"
                          onClick={() => markNotificationRead(notification.id)}
                          className="text-sm font-medium text-ink-600 underline-offset-2 hover:underline"
                        >
                          Mark as read
                        </button>
                      ) : null}
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
