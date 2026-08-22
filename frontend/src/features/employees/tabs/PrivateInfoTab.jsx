import { EditableField } from '../EditableField';
import { BankDetailsBlock } from '../BankDetailsBlock';

// Display-only mirror of the Private-Info fields an employee can edit — see the same caveat in
// ResumeTab.jsx. Everything else on this tab (DOB, nationality, personal email, gender, marital
// status) has no edit affordance for an Employee under the current D-21 default, matching
// backend/src/modules/employees/editPolicy.js's EMPLOYEE_EDITABLE_FIELDS exactly.
//
// `phone` is placed on this tab even though the phase spec's tab-layout description didn't list
// it explicitly — it's part of the PDF's employee-editable minimum (address, phone, picture) and
// EMPLOYEE_EDITABLE_FIELDS includes it, but no tab was named for it in the spec. Private Info is
// the natural home alongside the other personal-details fields.
const PRIVATE_INFO_EDITABLE_FIELDS = ['residingAddress', 'phone'];

const FIELDS = [
  { key: 'dateOfBirth', label: 'Date of Birth', format: formatDate },
  { key: 'phone', label: 'Phone' },
  { key: 'residingAddress', label: 'Residing Address' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'personalEmail', label: 'Personal Email' },
  { key: 'gender', label: 'Gender' },
  { key: 'maritalStatus', label: 'Marital Status' },
];

export function PrivateInfoTab({ profile, editable, onSave }) {
  return (
    <div className="private-info-tab">
      <div className="private-info-tab__fields">
        {FIELDS.map(({ key, label, format }) => (
          <EditableField
            key={key}
            label={label}
            value={format ? format(profile[key]) : profile[key]}
            editable={editable && PRIVATE_INFO_EDITABLE_FIELDS.includes(key)}
            onSave={(value) => onSave(key, value)}
          />
        ))}
        {/* Date of Joining is intentionally read-only — see editPolicy.js: the Login ID formula
            (Phase 02) is derived from it, so it never gets an edit affordance, for Employee or
            Admin alike. */}
        <div className="field-row field-row--readonly">
          <span className="field-row__label">Date of Joining</span>
          <span className="field-row__value">{formatDate(profile.dateOfJoining)}</span>
        </div>
      </div>
      <BankDetailsBlock bankDetails={profile.bankDetails} />
    </div>
  );
}

function formatDate(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString();
}
