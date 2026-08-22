import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './app/App.jsx';
import { AuthProvider } from './app/auth';
import { ProfilePage } from './features/employees/ProfilePage.jsx';

// Phase 04: /profile/me and /profile/:id are standalone, directly-routable pages — not yet
// linked from any navigation (Phase 05 builds the nav shell). AuthProvider wraps the whole tree
// so these routes (and Phase 05's nav) share the one token-storage mechanism from Phase 03.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/profile/me" element={<ProfilePage mode="me" />} />
          <Route path="/profile/:id" element={<ProfilePage mode="id" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
