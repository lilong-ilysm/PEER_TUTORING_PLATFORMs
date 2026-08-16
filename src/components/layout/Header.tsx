import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { APP_NAME } from '../../lib/config';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../ui/primitives';
import { Button, ButtonLink, IconButton } from '../ui/Button';
import { BellIcon, CloseIcon, LogoutIcon, MenuIcon, SearchIcon } from '../ui/icons';

const PUBLIC_LINKS = [
  { to: '/tutors', label: 'Find a tutor' },
  { to: '/subjects', label: 'Subjects' },
  { to: '/how-it-works', label: 'How it works' },
];

function Wordmark() {
  return (
    <Link
      to="/"
      className="flex shrink-0 items-center gap-2 rounded font-semibold text-ink-900"
      aria-label={`${APP_NAME} home`}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-sm font-bold text-white"
        aria-hidden="true"
      >
        PT
      </span>
      <span className="text-lg tracking-tight">{APP_NAME}</span>
    </Link>
  );
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-primary-50 text-primary-800' : 'text-ink-700 hover:bg-ink-100',
  );

export function Header() {
  const { isAuthenticated, user, unreadCount, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Focus is returned here when the sheet closes, rather than being dropped to the
  // top of the document.
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Route changes must close the sheet, or it stays open over the new page.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  /**
   * Dialog behaviour for the mobile sheet: Escape to close, no background scroll,
   * focus moved in on open, focus trapped while open, focus restored on close.
   *
   * The trap matters because this panel declares `aria-modal="true"`. Without it,
   * Tab walks straight out of the "modal" and into the page behind, which is both a
   * broken experience and a false promise to assistive technology.
   */
  useEffect(() => {
    if (!menuOpen) return;

    const previouslyFocused = (document.activeElement as HTMLElement | null) ?? null;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = [
        ...panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Prefer the hamburger, falling back to whatever had focus before.
      (triggerRef.current ?? previouslyFocused)?.focus?.();
    };
  }, [menuOpen]);

  async function handleSignOut() {
    await signOut();
    setMenuOpen(false);
    navigate('/', { replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-3">
        <Wordmark />

        {/* Desktop navigation */}
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {PUBLIC_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className={navLinkClass}>
              {link.label}
            </NavLink>
          ))}
          {isAuthenticated ? (
            <NavLink to="/dashboard" className={navLinkClass} end>
              Dashboard
            </NavLink>
          ) : null}
        </nav>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <>
              <Link
                to="/dashboard/notifications"
                className="relative hidden rounded-lg p-2.5 text-lg text-ink-700 hover:bg-ink-100 lg:block"
                aria-label={
                  unreadCount > 0
                    ? `Notifications, ${unreadCount} unread`
                    : 'Notifications'
                }
              >
                <BellIcon />
                {unreadCount > 0 ? (
                  <span
                    className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white"
                    aria-hidden="true"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                ) : null}
              </Link>

              <Link
                to="/dashboard/profile"
                className="hidden items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-100 lg:flex"
              >
                <Avatar name={user?.displayName ?? 'Member'} size="sm" />
                <span className="max-w-[10rem] truncate text-sm font-medium text-ink-800">
                  {user?.displayName}
                </span>
              </Link>

              <div className="hidden lg:block">
                <IconButton label="Sign out" onClick={handleSignOut}>
                  <LogoutIcon />
                </IconButton>
              </div>
            </>
          ) : (
            <div className="hidden items-center gap-2 lg:flex">
              <ButtonLink to="/login" variant="ghost" size="sm">
                Log in
              </ButtonLink>
              <ButtonLink to="/register" size="sm">
                Sign up
              </ButtonLink>
            </div>
          )}

          {/* Mobile controls */}
          <Link
            to="/tutors"
            className="rounded-lg p-2.5 text-lg text-ink-700 hover:bg-ink-100 lg:hidden"
            aria-label="Search tutors"
          >
            <SearchIcon />
          </Link>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-xl text-ink-800 hover:bg-ink-100 lg:hidden"
          >
            <MenuIcon />
            <span className="sr-only">Open menu</span>
          </button>
        </div>
      </div>

      {/*
        Mobile sheet, PORTALLED TO document.body.

        This is not optional tidiness. The <header> above carries `backdrop-blur`,
        and per CSS spec an element with a backdrop-filter (like transform, filter or
        perspective) becomes the CONTAINING BLOCK for its position:fixed
        descendants. Rendered inside the header, this panel's `fixed inset-0`
        therefore resolved against the header's 64px-tall box instead of the
        viewport: the drawer was clipped to just its own title row, the navigation
        links were cut off entirely, and the backdrop only dimmed the header strip.

        Portalling to body escapes that containing block, and also puts the panel in
        the root stacking context so z-index behaves predictably. `Modal.tsx` already
        does this, which is why dialogs were unaffected.
      */}
      {menuOpen
        ? createPortal(
            <div className="fixed inset-0 z-50 lg:hidden">
              <div
                className="absolute inset-0 bg-ink-900/50"
                onClick={() => setMenuOpen(false)}
                aria-hidden="true"
              />
              <div
                ref={panelRef}
                id="mobile-menu"
                role="dialog"
                aria-modal="true"
                aria-label="Menu"
                className="absolute inset-y-0 right-0 flex w-full max-w-xs flex-col bg-white shadow-pop"
              >
            <div className="flex h-16 items-center justify-between border-b border-ink-200 px-4">
              <span className="font-semibold text-ink-900">Menu</span>
              <IconButton
                ref={closeButtonRef}
                label="Close menu"
                onClick={() => setMenuOpen(false)}
              >
                <CloseIcon />
              </IconButton>
            </div>

            <nav aria-label="Mobile" className="flex-1 overflow-y-auto p-3">
              <ul className="space-y-1">
                {PUBLIC_LINKS.map((link) => (
                  <li key={link.to}>
                    <NavLink
                      to={link.to}
                      className={({ isActive }) =>
                        cn(
                          'block rounded-lg px-3 py-3 text-base font-medium',
                          isActive
                            ? 'bg-primary-50 text-primary-800'
                            : 'text-ink-800 hover:bg-ink-100',
                        )
                      }
                    >
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>

              <hr className="my-3 border-ink-200" />

              {isAuthenticated ? (
                <ul className="space-y-1">
                  <li className="flex items-center gap-2.5 px-3 py-2">
                    <Avatar name={user?.displayName ?? 'Member'} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800">
                      {user?.displayName}
                    </span>
                  </li>
                  {[
                    { to: '/dashboard', label: 'Dashboard' },
                    { to: '/dashboard/sessions', label: 'My sessions' },
                    { to: '/dashboard/messages', label: 'Messages' },
                    {
                      to: '/dashboard/notifications',
                      label:
                        unreadCount > 0
                          ? `Notifications (${unreadCount})`
                          : 'Notifications',
                    },
                    { to: '/dashboard/profile', label: 'My profile' },
                  ].map((link) => (
                    <li key={link.to}>
                      <NavLink
                        to={link.to}
                        end={link.to === '/dashboard'}
                        className={({ isActive }) =>
                          cn(
                            'block rounded-lg px-3 py-3 text-base font-medium',
                            isActive
                              ? 'bg-primary-50 text-primary-800'
                              : 'text-ink-800 hover:bg-ink-100',
                          )
                        }
                      >
                        {link.label}
                      </NavLink>
                    </li>
                  ))}
                  <li className="pt-2">
                    <Button variant="secondary" fullWidth onClick={handleSignOut}>
                      Sign out
                    </Button>
                  </li>
                </ul>
              ) : (
                <div className="space-y-2 px-1 pt-1">
                  <ButtonLink to="/login" variant="secondary" fullWidth size="lg">
                    Log in
                  </ButtonLink>
                  <ButtonLink to="/register" fullWidth size="lg">
                    Create an account
                  </ButtonLink>
                </div>
              )}
                </nav>
              </div>
            </div>,
            document.body,
          )
        : null}
    </header>
  );
}
