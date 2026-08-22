import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { fetchMyProfile, fetchProfileById, updateMyProfile, uploadAvatar } from './api';
import { ProfileHeader } from './ProfileHeader';
import { ResumeTab } from './tabs/ResumeTab';
import { PrivateInfoTab } from './tabs/PrivateInfoTab';
import { SalaryInfoStub } from './tabs/SalaryInfoStub';
import { SecurityStub } from './tabs/SecurityStub';
import './ProfilePage.css';

const TAB_LABELS = {
  resume: 'Resume',
  'private-info': 'Private Info',
  'salary-info': 'Salary Info',
  security: 'Security',
};

// Pure and exported so it's directly testable (see scripts/smoke-profile.mjs) without needing to
// exercise the component's data-fetching lifecycle. The Security tab only ever appears for an
// Employee viewing their OWN profile — never for Admin's own profile, and never for anyone
// viewing someone else's (that last case is always view-only regardless of role or tab).
export function computeTabSet({ isOwnProfile, role }) {
  const showSecurityTab = isOwnProfile && role === 'employee';
  return ['resume', 'private-info', 'salary-info', ...(showSecurityTab ? ['security'] : [])];
}

// Standalone, directly-routable profile page — Phase 04. Not linked from any navigation yet
// (Phase 05 builds the nav shell); reached via a direct URL (/profile/me or /profile/:id).
//
// Three viewing contexts, matching the design:
//   - Own profile, viewer is Employee -> tabs: Resume | Private Info | Salary Info | Security
//   - Own profile, viewer is Admin/HR -> tabs: Resume | Private Info | Salary Info (no Security)
//   - Someone else's profile (reachable at all only if the backend's GET /employees/:id guard
//     allows it — owner or Admin/HR, per D-14's conservative default) -> view-only, no edit
//     affordances rendered at all, regardless of viewer role.
//
// Edit affordances only ever appear when isOwnProfile is true, and are always restricted to the
// same field set the backend's PATCH /employees/me enforces (EMPLOYEE_EDITABLE_FIELDS) — that
// holds for an Admin editing their OWN profile too, because /me is field-restricted regardless
// of caller role (see backend/src/modules/employees/routes.js). Admin's "edit any field" power
// only exists via PATCH /employees/:id, which this phase deliberately gives no UI to yet.
// TODO(D-14): if Admin should be able to edit inline while viewing someone else's profile,
// that's a UX decision not specified by either source — for now this page always renders that
// case read-only; a future phase can add an explicit "Edit" affordance if needed.
export function ProfilePage({ mode }) {
  const { id: routeId } = useParams();
  const { user, accessToken } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('resume');

  const targetId = mode === 'me' ? user?.id : routeId;
  const isOwnProfile = Boolean(user && targetId && user.id === targetId);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const load = mode === 'me' ? fetchMyProfile(accessToken) : fetchProfileById(routeId, accessToken);
    load
      .then((data) => {
        setProfile(data.profile);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [mode, routeId, accessToken]);

  async function handleFieldSave(field, value) {
    const data = await updateMyProfile(accessToken, { [field]: value });
    setProfile(data.profile);
  }

  async function handleAvatarUpload(file) {
    const data = await uploadAvatar(accessToken, file);
    setProfile(data.profile);
  }

  if (!accessToken) {
    return <p className="profile-page__notice">Sign in required to view this profile.</p>;
  }
  if (loading) return <p className="profile-page__notice">Loading profile…</p>;
  if (error) return <p className="profile-page__notice profile-page__notice--error">{error}</p>;
  if (!profile) return null;

  const tabs = computeTabSet({ isOwnProfile, role: user.role });
  const showSecurityTab = tabs.includes('security');

  return (
    <div className="profile-page">
      {!isOwnProfile && <p className="profile-page__view-only-banner">Viewing in view-only mode</p>}

      <ProfileHeader profile={profile} editable={isOwnProfile} onAvatarUpload={handleAvatarUpload} />

      <nav className="profile-page__tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={tab === activeTab ? 'is-active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>

      <div className="profile-page__panel">
        {activeTab === 'resume' && <ResumeTab profile={profile} editable={isOwnProfile} onSave={handleFieldSave} />}
        {activeTab === 'private-info' && (
          <PrivateInfoTab profile={profile} editable={isOwnProfile} onSave={handleFieldSave} />
        )}
        {activeTab === 'salary-info' && <SalaryInfoStub />}
        {activeTab === 'security' && showSecurityTab && <SecurityStub />}
      </div>
    </div>
  );
}
