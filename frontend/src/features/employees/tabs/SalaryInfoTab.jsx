import { useEffect, useState } from 'react';
import { useAuth } from '../../../app/auth';
import { useDebouncedValue } from '../../../app/useDebouncedValue';
import { fetchMyPayroll, fetchPayrollForEmployee, updatePayroll, previewPayroll } from '../../payroll/api';
import { defaultDraft } from '../../payroll/defaultDraft';
import { SalaryComponentsEditor } from '../../payroll/SalaryComponentsEditor';
import './SalaryInfoTab.css';

// [RECOMMENDATION] 400ms debounce for live recalculation on wage/component change — matches
// Phase 05/06/07's 300ms search-debounce precedent; slightly longer here since a preview call
// (server-side validation + the full calculation engine) is heavier than a search query.
const PREVIEW_DEBOUNCE_MS = 400;

function formatCurrency(amount) {
  if (amount == null) return '—';
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toDraft(structure) {
  return {
    monthlyWage: structure.monthlyWage,
    yearlyWage: structure.yearlyWage,
    workingDaysPerWeek: structure.workingDaysPerWeek,
    breakTimeHours: structure.breakTimeHours,
    components: structure.components.map(({ amount, id, ...rest }) => rest),
  };
}

// Phase 08 replaces Phase 04's SalaryInfoStub entirely — no stub remains alongside this.
//
// `canEdit` here is NOT the same as the rest of the profile page's `editable` prop
// (isOwnProfile). Per [PDF §3.6.1]/[PDF §3.6.2] and D-03 (see payrollPolicy.js): an Employee can
// never edit salary, even their own (view-only, [PDF §3.6.1]), while an Admin can edit ANY
// employee's salary, including one that isn't their own profile ([PDF §3.6.2] grants Admin
// update rights explicitly). This deliberately DIVERGES from Phase 04's view-only-for-others
// rule that governs the Resume/Private Info tabs on this same page — flagged here since it's the
// one part of this screen where "viewing someone else's profile" does not mean read-only.
export function SalaryInfoTab({ employeeId, isOwnProfile, viewerRole }) {
  const { accessToken } = useAuth();
  const canEdit = viewerRole === 'admin_hr';

  const [loading, setLoading] = useState(true);
  const [structure, setStructure] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  function load() {
    if (!accessToken) return;
    setLoading(true);
    const fetcher = isOwnProfile ? fetchMyPayroll(accessToken) : fetchPayrollForEmployee(accessToken, employeeId);
    fetcher
      .then((data) => {
        setStructure(data.structure);
        setError(null);
      })
      .catch((err) => {
        // 404 NO_SALARY_STRUCTURE is a real, expected state (Empty state, not an error banner).
        if (err.code === 'NO_SALARY_STRUCTURE') {
          setStructure(null);
          setError(null);
        } else {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [accessToken, employeeId, isOwnProfile]);

  const debouncedDraft = useDebouncedValue(draft, PREVIEW_DEBOUNCE_MS);

  useEffect(() => {
    if (!editing || !debouncedDraft || !accessToken) return;
    previewPayroll(accessToken, employeeId, debouncedDraft)
      .then((data) => {
        setPreview(data.structure);
        setPreviewError(null);
      })
      .catch((err) => {
        setPreview(null);
        setPreviewError(err.message);
      });
  }, [editing, debouncedDraft, accessToken, employeeId]);

  function startEdit() {
    setDraft(structure ? toDraft(structure) : defaultDraft());
    setPreview(null);
    setPreviewError(null);
    setSaveError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft(null);
    setPreview(null);
    setPreviewError(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const data = await updatePayroll(accessToken, employeeId, draft);
      setStructure(data.structure);
      setEditing(false);
      setDraft(null);
    } catch (err) {
      // [RECOMMENDATION] The design draws no validation-error state for the wage constraint —
      // render the 422 message inline and do not let the save appear to succeed.
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="salary-info-tab__notice">Loading…</p>;
  if (error) return <p className="salary-info-tab__notice salary-info-tab__notice--error">{error}</p>;

  if (!structure && !editing) {
    return (
      <div className="salary-info-tab">
        <p className="salary-info-tab__notice">No salary structure configured</p>
        {/* Employees see the empty state with no create option — only Admin gets the affordance. */}
        {canEdit && (
          <button type="button" onClick={startEdit}>
            + Create salary structure
          </button>
        )}
      </div>
    );
  }

  if (editing) {
    return (
      <div className="salary-info-tab">
        <div className="salary-info-tab__header">
          <label>
            Month Wage
            <input
              type="number"
              value={draft.monthlyWage}
              onChange={(e) => {
                const monthlyWage = Number(e.target.value);
                setDraft((d) => ({ ...d, monthlyWage, yearlyWage: Math.round(monthlyWage * 12 * 100) / 100 }));
              }}
            />
          </label>
          <label>
            Yearly Wage
            <input type="number" value={draft.yearlyWage} readOnly disabled />
          </label>
          <label>
            No. of working days in a week
            <input
              type="number"
              value={draft.workingDaysPerWeek ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, workingDaysPerWeek: e.target.value ? Number(e.target.value) : null }))}
            />
          </label>
          <label>
            Break Time (/hrs)
            <input
              type="number"
              value={draft.breakTimeHours ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, breakTimeHours: e.target.value ? Number(e.target.value) : null }))}
            />
          </label>
        </div>

        <SalaryComponentsEditor components={draft.components} onChange={(components) => setDraft((d) => ({ ...d, components }))} />

        {previewError && <p className="salary-info-tab__error">{previewError}</p>}
        {saveError && <p className="salary-info-tab__error">{saveError}</p>}

        {preview ? <SalarySummary structure={preview} /> : <p className="salary-info-tab__notice">Calculating…</p>}

        <div className="salary-info-tab__actions">
          <button type="button" onClick={cancelEdit} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="salary-info-tab">
      <div className="salary-info-tab__header">
        <div className="salary-info-tab__field">
          <span className="salary-info-tab__label">Month Wage</span>
          <span className="salary-info-tab__value">{formatCurrency(structure.monthlyWage)}</span>
        </div>
        <div className="salary-info-tab__field">
          <span className="salary-info-tab__label">Yearly Wage</span>
          <span className="salary-info-tab__value">{formatCurrency(structure.yearlyWage)}</span>
        </div>
        <div className="salary-info-tab__field">
          <span className="salary-info-tab__label">No. of working days in a week</span>
          <span className="salary-info-tab__value">{structure.workingDaysPerWeek ?? '—'}</span>
        </div>
        <div className="salary-info-tab__field">
          <span className="salary-info-tab__label">Break Time (/hrs)</span>
          <span className="salary-info-tab__value">{structure.breakTimeHours ?? '—'}</span>
        </div>
        {canEdit && (
          <button type="button" onClick={startEdit}>
            Edit
          </button>
        )}
      </div>

      <SalarySection components={structure.components} kind="earning" title="Components" />
      {/* PF (Employee) and Professional Tax are both component_kind="deduction_employee" —
          grouped together here by kind, per the schema's design ("Grouping for display is a
          frontend concern driven by component_kind" — see the migration comment). */}
      <SalarySection components={structure.components} kind="deduction_employee" title="Deductions" />
      <SalarySection components={structure.components} kind="contribution_employer" title="Employer Contributions" />

      <SalarySummary structure={structure} />
    </div>
  );
}

function SalarySection({ components, kind, title }) {
  const rows = components.filter((c) => c.componentKind === kind);
  if (rows.length === 0) return null;
  return (
    <div className="salary-section">
      <h3>{title}</h3>
      <table className="salary-table">
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                <div className="salary-table__name">{c.name}</div>
                {c.description && <div className="salary-table__desc">{c.description}</div>}
              </td>
              <td className="salary-table__percent">{c.computationType === 'percentage' ? `${c.value}%` : '—'}</td>
              <td className="salary-table__amount">{formatCurrency(c.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// [INFERENCE] Not drawn in the design, but computed per D-36 and needed to make the numbers
// legible — a components table with no running total is hard to verify at a glance.
function SalarySummary({ structure }) {
  return (
    <div className="salary-summary">
      <div>
        <span>Gross Salary</span>
        <strong>{formatCurrency(structure.grossSalary)}</strong>
      </div>
      <div>
        <span>Total Deductions</span>
        <strong>{formatCurrency(structure.totalDeductions)}</strong>
      </div>
      <div>
        <span>Net Salary</span>
        <strong>{formatCurrency(structure.netSalary)}</strong>
      </div>
    </div>
  );
}
