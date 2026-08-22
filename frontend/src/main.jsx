import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './app/auth';
import { AppShell } from './app/nav/AppShell.jsx';
import { SignInPage } from './features/auth/SignInPage.jsx';
import { DirectoryPage } from './features/employees/DirectoryPage.jsx';
import { ProfilePage } from './features/employees/ProfilePage.jsx';
import { AttendancePage } from './features/attendance/AttendancePage.jsx';
import { TimeOffPage } from './features/leave/TimeOffPage.jsx';

// Phase 05: the Employees directory ("/") is the default post-login landing route, per the
// design's explicit "must land on this page" instruction (D-02 default — see
// DirectoryPage.jsx). Every authenticated route is nested under AppShell, which wraps Phase
// 03's <RequireAuth> and renders the persistent nav shell for the first time. /signin sits
// outside AppShell since it must be reachable without a session.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/signin" element={<SignInPage />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<DirectoryPage />} />
            {/* Phase 06 replaces Phase 05's placeholder here. */}
            <Route path="/attendance" element={<AttendancePage />} />
            {/* Phase 07 replaces Phase 05's placeholder here. */}
            <Route path="/time-off" element={<TimeOffPage />} />
            <Route path="/profile/me" element={<ProfilePage mode="me" />} />
            <Route path="/profile/:id" element={<ProfilePage mode="id" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
