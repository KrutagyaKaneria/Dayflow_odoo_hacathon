import { useState } from 'react';

// Shared by ResumeTab and PrivateInfoTab. Renders a pencil-icon edit affordance only when
// `editable` is true — the caller decides that per-field (see the EMPLOYEE_EDITABLE_FIELDS
// mirror in ResumeTab.jsx / PrivateInfoTab.jsx). This is a UI convenience only; the backend's
// editPolicy.js (Phase 04, D-21) is the actual enforcement.
export function EditableField({ label, value, editable, multiline = false, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  if (!editing) {
    return (
      <div className="field-row">
        <span className="field-row__label">{label}</span>
        <span className="field-row__value">{value || '—'}</span>
        {editable && (
          <button
            type="button"
            className="field-row__edit"
            aria-label={`Edit ${label}`}
            onClick={() => {
              setDraft(value || '');
              setEditing(true);
            }}
          >
            ✎
          </button>
        )}
      </div>
    );
  }

  const InputTag = multiline ? 'textarea' : 'input';

  return (
    <div className="field-row field-row--editing">
      <span className="field-row__label">{label}</span>
      <InputTag value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button
        type="button"
        onClick={() => {
          onSave(draft);
          setEditing(false);
        }}
      >
        Save
      </button>
      <button type="button" onClick={() => setEditing(false)}>
        Cancel
      </button>
    </div>
  );
}
