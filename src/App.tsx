import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DashboardLayout } from './components/layout/DashboardLayout';
import {
  RedirectIfAuthenticated,
  RequireAdmin,
  RequireAuth,
  RequireTutor,
} from './components/layout/RouteGuards';
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminOverviewPage } from './pages/admin/AdminOverview';
import { AdminUsersPage } from './pages/admin/AdminUsers';
import { AdminTutorsPage } from './pages/admin/AdminTutors';
import { AdminSessionsPage } from './pages/admin/AdminSessions';
import { AdminReviewsPage } from './pages/admin/AdminReviews';
import { AdminSubjectsPage } from './pages/admin/AdminSubjects';

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
      {/*
        Admin sits OUTSIDE the public AppShell: it has its own chrome, and the public
        marketing header and bottom tab bar are meaningless in an internal tool.
        RequireAdmin gates rendering; the server independently authorises every
        request behind these screens.
      */}
      <Route element={<RequireAdmin />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminOverviewPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="tutors" element={<AdminTutorsPage />} />
          <Route path="sessions" element={<AdminSessionsPage />} />
          <Route path="reviews" element={<AdminReviewsPage />} />
          <Route path="subjects" element={<AdminSubjectsPage />} />
        </Route>
      </Route>

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

        {/* Explicit target for RequireAdmin, so a non-admin hitting /admin lands on
            a normal 404 rather than being told an admin area exists. */}
        <Route path="/not-found" element={<NotFoundPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
