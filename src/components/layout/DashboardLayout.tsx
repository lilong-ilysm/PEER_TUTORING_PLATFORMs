import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Badge } from '../ui/primitives';
import { ROLE_LABELS } from '../../../shared/domain/subjects';
import {
  BellIcon,
  CalendarIcon,
  ClockIcon,
  GridIcon,
  MessageIcon,
  UserIcon,
} from '../ui/icons';

export function DashboardLayout() {
  const { user, profile, isTutor, unreadCount } = useAuth();
  const roles = profile?.roles ?? user?.roles ?? [];

  const links = [
    { to: '/dashboard', label: 'Overview', icon: <GridIcon />, end: true },
    { to: '/dashboard/sessions', label: 'Sessions', icon: <CalendarIcon />, end: false },
    // Tutor-only, and hidden rather than shown-and-broken for learners.
    ...(isTutor
      ? [
          {
            to: '/dashboard/availability',
            label: 'Availability',
            icon: <ClockIcon />,
            end: false,
          },
        ]
      : []),
    { to: '/dashboard/messages', label: 'Messages', icon: <MessageIcon />, end: false },
    {
      to: '/dashboard/notifications',
      label: 'Notifications',
      icon: <BellIcon />,
      end: false,
      badge: unreadCount,
    },
    { to: '/dashboard/profile', label: 'My profile', icon: <UserIcon />, end: false },
  ];

  return (
    <div className="container-page py-6 lg:py-8">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
        {/* Desktop sidebar. On mobile the bottom tab bar covers this ground. */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-3">
              <Avatar name={user?.displayName ?? 'Member'} />
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-900">{user?.displayName}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {roles.map((role) => (
                    <Badge key={role} tone="primary">
                      {ROLE_LABELS[role]}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <nav aria-label="Dashboard">
              <ul className="space-y-1">
                {links.map((link) => (
                  <li key={link.to}>
                    <NavLink
                      to={link.to}
                      end={link.end}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium',
                          isActive
                            ? 'bg-primary-50 text-primary-800'
                            : 'text-ink-700 hover:bg-ink-100',
                        )
                      }
                    >
                      <span className="text-lg" aria-hidden="true">
                        {link.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{link.label}</span>
                      {link.badge ? (
                        <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {link.badge}
                          <span className="sr-only"> unread</span>
                        </span>
                      ) : null}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </aside>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
