import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { BellIcon, CalendarIcon, GridIcon, MessageIcon, SearchIcon } from '../ui/icons';

/**
 * Bottom navigation for signed-in users on small screens.
 *
 * Thumb reach beats screen real estate on a booking workflow: the four
 * destinations a signed-in user actually moves between should not be two taps deep
 * behind a hamburger.
 */
export function MobileTabBar() {
  const { unreadCount } = useAuth();

  const tabs = [
    { to: '/dashboard', label: 'Home', icon: <GridIcon />, end: true },
    { to: '/tutors', label: 'Find', icon: <SearchIcon />, end: false },
    { to: '/dashboard/sessions', label: 'Sessions', icon: <CalendarIcon />, end: false },
    { to: '/dashboard/messages', label: 'Messages', icon: <MessageIcon />, end: false },
    {
      to: '/dashboard/notifications',
      label: 'Alerts',
      icon: <BellIcon />,
      end: false,
      badge: unreadCount,
    },
  ];

  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white pb-safe lg:hidden"
    >
      <ul className="flex items-stretch">
        {tabs.map((tab) => (
          <li key={tab.to} className="min-w-0 flex-1">
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'relative flex h-full flex-col items-center gap-1 px-1 pt-2 text-[11px] font-medium',
                  isActive ? 'text-primary-700' : 'text-ink-600',
                )
              }
            >
              <span className="text-xl" aria-hidden="true">
                {tab.icon}
              </span>
              <span className="truncate">{tab.label}</span>
              {tab.badge ? (
                <span
                  className="absolute right-1/2 top-1 translate-x-3 rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold text-white"
                  aria-hidden="true"
                >
                  {tab.badge > 9 ? '9+' : tab.badge}
                </span>
              ) : null}
              {tab.badge ? (
                <span className="sr-only">{tab.badge} unread</span>
              ) : null}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
