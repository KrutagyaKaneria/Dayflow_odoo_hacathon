import { useState } from 'react';
import { EditableField } from '../EditableField';

// Display-only mirror of which Resume-tab fields show an edit affordance — the backend's
// EMPLOYEE_EDITABLE_FIELDS (src/modules/employees/editPolicy.js, D-21) is the only place this is
// actually enforced. If this list ever drifts from the backend's, PATCH /employees/me silently
// ignores anything not on the backend list — no security consequence, only a stale pencil icon.
const RESUME_EDITABLE_FIELDS = ['about', 'jobLikes', 'skills'];

export function ResumeTab({ profile, editable, onSave }) {
  const canEditField = (field) => editable && RESUME_EDITABLE_FIELDS.includes(field);

  return (
    <div className="resume-tab">
      <EditableField
        label="About"
        value={profile.about}
        editable={canEditField('about')}
        multiline
        onSave={(value) => onSave('about', value)}
      />
      <EditableField
        label="What I love about my job"
        value={profile.jobLikes}
        editable={canEditField('jobLikes')}
        multiline
        onSave={(value) => onSave('jobLikes', value)}
      />
      <SkillsPanel skills={profile.skills || []} editable={canEditField('skills')} onSave={(skills) => onSave('skills', skills)} />
    </div>
  );
}

function SkillsPanel({ skills, editable, onSave }) {
  const [newSkill, setNewSkill] = useState('');

  function addSkill() {
    const trimmed = newSkill.trim();
    if (!trimmed) return;
    onSave([...skills, trimmed]);
    setNewSkill('');
  }

  return (
    <div className="skills-panel">
      <span className="field-row__label">Skills</span>
      <ul className="skills-panel__list">
        {skills.length === 0 && <li className="skills-panel__empty">No skills added yet.</li>}
        {skills.map((skill, i) => (
          <li key={`${skill}-${i}`}>{skill}</li>
        ))}
      </ul>
      {editable && (
        <div className="skills-panel__add">
          <input
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value)}
            placeholder="Add a skill"
            onKeyDown={(e) => e.key === 'Enter' && addSkill()}
          />
          <button type="button" onClick={addSkill}>
            + Add Skills
          </button>
        </div>
      )}
    </div>
  );
}
