import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../ui/primitives';
import { Button } from '../ui/Button';
import {
  BookIcon,
  CalendarIcon,
  CloseIcon,
  GridIcon,
  MenuIcon,
  StarIcon,
  UserIcon,
} from '../ui/icons';

/**
 * Shell for the admin area.
 *
 * Deliberately a different chrome from the public site: an internal tool, sized for
 * scanning tables rather than for browsing. It reuses the existing design tokens
 * (same colours, radii, spacing, focus rings) so it does not look like a second
 * application, but it drops the marketing navigation, which would be meaningless
 * here.
 *
 * Layout: persistent sidebar from lg up, off-canvas drawer below. The drawer is
 * rendered as a sibling of the content rather than inside a blurred header, which is
 * what previously broke the public mobile menu.
 */

const LINKS = [
  { to: '/admin', label: 'Overview', icon: <GridIcon />, end: true },
  { to: '/admin/users', label: 'Users', icon: <UserIcon />, end: false },
  { to: '/admin/tutors', label: 'Tutors', icon: <BookIcon />, end: false },
  { to: '/admin/sessions', label: 'Sessions', icon: <CalendarIcon />, end: false },
  { to: '/admin/reviews', label: 'Reviews', icon: <StarIcon />, end: false },
  { to: '/admin/subjects', label: 'Subjects', icon: <BookIcon />, end: false },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {LINKS.map((link) => (
        <li key={link.to}>
          <NavLink
            to={link.to}
            end={link.end}
            onClick={onNavigate}
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
            {link.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close on navigation, or the drawer covers the page it just opened.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="min-h-dvh bg-ink-50">
      {/* Admin top bar. No backdrop-filter here, deliberately: it would make this
          element a containing block for fixed-position children. */}
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-expanded={drawerOpen}
              aria-controls="admin-drawer"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-xl text-ink-800 hover:bg-ink-100 lg:hidden"
            >
              <MenuIcon />
              <span className="sr-only">Open admin menu</span>
            </button>

            <span className="truncate font-semibold text-ink-900">
              PeerTutor
              <span className="text-ink-400"> / </span>
              Admin
            </span>
            <Badge tone="danger">Restricted</Badge>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden max-w-[12rem] truncate text-sm text-ink-600 sm:block">
              {user?.displayName}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-ink-200 bg-white lg:block">
          <nav aria-label="Admin" className="sticky top-14 p-3">
            <NavItems />
          </nav>
        </aside>

        {/* min-w-0 so wide content cannot stretch the grid track and create
            horizontal scrolling. */}
        <main className="min-w-0 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-900/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            id="admin-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Admin menu"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white shadow-pop"
          >
            <div className="flex h-14 items-center justify-between border-b border-ink-200 px-3">
              <span className="font-semibold text-ink-900">Admin</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-lg text-ink-700 hover:bg-ink-100"
              >
                <CloseIcon />
                <span className="sr-only">Close admin menu</span>
              </button>
            </div>
            <nav aria-label="Admin" className="flex-1 overflow-y-auto p-3">
              <NavItems onNavigate={() => setDrawerOpen(false)} />
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Shared page header for admin screens. */
export function AdminPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-600">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
