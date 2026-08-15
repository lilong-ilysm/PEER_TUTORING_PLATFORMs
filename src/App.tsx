import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DashboardLayout } from './components/layout/DashboardLayout';
import {
  RedirectIfAuthenticated,
  RequireAuth,
  RequireTutor,
} from './components/layout/RouteGuards';

import { LandingPage } from './pages/Landing';
import { TutorSearchPage } from './pages/TutorSearch';
import { TutorProfilePage } from './pages/TutorProfile';
import { SubjectsPage } from './pages/Subjects';
import { HowItWorksPage } from './pages/HowItWorks';
import { LoginPage } from './pages/Login';
import { RegisterPage } from './pages/Register';
import { NotFoundPage } from './pages/NotFound';

import { DashboardOverviewPage } from './pages/dashboard/Overview';
import { DashboardSessionsPage } from './pages/dashboard/Sessions';
import { DashboardAvailabilityPage } from './pages/dashboard/Availability';
import { DashboardProfilePage } from './pages/dashboard/MyProfile';
import { DashboardMessagesPage } from './pages/dashboard/Messages';
import { DashboardNotificationsPage } from './pages/dashboard/Notifications';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Public: discovery is open, which is what lets a guest evaluate the
            platform before committing to an account. */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/tutors" element={<TutorSearchPage />} />
        <Route path="/tutors/:tutorId" element={<TutorProfilePage />} />
        <Route path="/subjects" element={<SubjectsPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />

        <Route
          path="/login"
          element={
            <RedirectIfAuthenticated>
              <LoginPage />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path="/register"
          element={
            <RedirectIfAuthenticated>
              <RegisterPage />
            </RedirectIfAuthenticated>
          }
        />

        {/* Authenticated */}
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardOverviewPage />} />
            <Route path="sessions" element={<DashboardSessionsPage />} />
            <Route path="messages" element={<DashboardMessagesPage />} />
            <Route path="notifications" element={<DashboardNotificationsPage />} />
            <Route path="profile" element={<DashboardProfilePage />} />

            {/* Tutor-only. Nested guard rather than a check inside the page, so
                the page never renders for a learner at all (AC-6). */}
            <Route element={<RequireTutor />}>
              <Route path="availability" element={<DashboardAvailabilityPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
