import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { DemoBanner } from './DemoBanner';
import { MobileTabBar } from './MobileTabBar';
import { useAuth } from '../../context/AuthContext';

/** Restores scroll position to the top on navigation, which routers do not do. */
function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname, search]);

  return null;
}

export function AppShell() {
  const { isAuthenticated } = useAuth();

  return (
    // `overflow-x-hidden` here as well as on body: a single stray wide child
    // should never be able to produce a horizontal scrollbar (AC-32).
    <div className="flex min-h-dvh flex-col overflow-x-hidden">
      <ScrollToTop />

      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <DemoBanner />
      <Header />

      <main
        id="main"
        // Bottom padding clears the mobile tab bar when it is present.
        className={isAuthenticated ? 'flex-1 pb-24 lg:pb-0' : 'flex-1'}
      >
        <Outlet />
      </main>

      <Footer />
      {isAuthenticated ? <MobileTabBar /> : null}
    </div>
  );
}
