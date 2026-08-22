import { API_BASE_URL } from './api';
import { initials } from './initials';

export function ProfileHeader({ profile, editable, onAvatarUpload }) {
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) onAvatarUpload(file);
    e.target.value = ''; // allow re-selecting the same file later
  }

  return (
    <header className="profile-header">
      <div className="profile-header__avatar-wrap">
        {profile.avatarUrl ? (
          <img className="profile-header__avatar" src={`${API_BASE_URL}${profile.avatarUrl}`} alt={`${profile.name}'s avatar`} />
        ) : (
          <div className="profile-header__avatar profile-header__avatar--placeholder">{initials(profile.name)}</div>
        )}
        {editable && (
          <label className="profile-header__avatar-edit" aria-label="Change avatar">
            ✎
            <input type="file" accept="image/*" onChange={handleFileChange} hidden />
          </label>
        )}
      </div>
      <div>
        <h1>{profile.name}</h1>
        <p className="profile-header__meta">
          {profile.department || '—'} · {profile.location || '—'}
        </p>
      </div>
    </header>
  );
}
