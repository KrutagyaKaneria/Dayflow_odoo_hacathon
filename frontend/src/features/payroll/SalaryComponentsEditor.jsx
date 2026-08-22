const COMPONENT_KIND_OPTIONS = [
  { value: 'earning', label: 'Earning' },
  { value: 'deduction_employee', label: 'Deduction (Employee)' },
  { value: 'contribution_employer', label: 'Contribution (Employer)' },
];
const COMPUTATION_TYPE_OPTIONS = [
  { value: 'fixed_amount', label: 'Fixed Amount' },
  { value: 'percentage', label: 'Percentage' },
];
// [DESIGN's own note confirms a mixed base — see payrollPolicy.js D-35] "of Wage" vs "of Basic"
// are genuinely different bases, not synonyms — this dropdown is the per-component choice D-35
// requires.
const PERCENTAGE_BASE_OPTIONS = [
  { value: 'wage', label: 'of Wage' },
  { value: 'basic', label: 'of Basic' },
];

// Admin-only editor for a candidate component set. Pure controlled-component shape — the caller
// (SalaryInfoTab) owns the draft state and debounces a POST /preview call on change; this
// component never computes an amount itself.
export function SalaryComponentsEditor({ components, onChange }) {
  function updateRow(index, patch) {
    onChange(components.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function addRow() {
    const nextOrder = components.length ? Math.max(...components.map((c) => c.displayOrder)) + 1 : 1;
    onChange([
      ...components,
      {
        name: '',
        componentKind: 'earning',
        computationType: 'fixed_amount',
        percentageBase: null,
        isBasic: false,
        value: 0,
        description: '',
        displayOrder: nextOrder,
      },
    ]);
  }

  function removeRow(index) {
    onChange(components.filter((_, i) => i !== index));
  }

  // Only one component may be Basic (D-35) — a radio group enforces that by construction.
  function setBasic(index) {
    onChange(components.map((c, i) => ({ ...c, isBasic: i === index })));
  }

  return (
    <div className="salary-components-editor">
      <table className="salary-components-editor__table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Kind</th>
            <th>Type</th>
            <th>Base</th>
            <th>Value</th>
            <th>Basic?</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {components.map((c, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr key={i}>
              <td>
                <input value={c.name} onChange={(e) => updateRow(i, { name: e.target.value })} />
              </td>
              <td>
                <select value={c.componentKind} onChange={(e) => updateRow(i, { componentKind: e.target.value })}>
                  {COMPONENT_KIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select
                  value={c.computationType}
                  onChange={(e) => {
                    const computationType = e.target.value;
                    updateRow(i, {
                      computationType,
                      percentageBase: computationType === 'percentage' ? c.percentageBase || 'basic' : null,
                    });
                  }}
                >
                  {COMPUTATION_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                {c.computationType === 'percentage' ? (
                  <select value={c.percentageBase || 'basic'} onChange={(e) => updateRow(i, { percentageBase: e.target.value })}>
                    {PERCENTAGE_BASE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  '—'
                )}
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  value={c.value}
                  onChange={(e) => updateRow(i, { value: Number(e.target.value) })}
                />
              </td>
              <td>
                <input type="radio" name="salary-is-basic" checked={Boolean(c.isBasic)} onChange={() => setBasic(i)} />
              </td>
              <td>
                <button type="button" onClick={() => removeRow(i)} aria-label={`Remove ${c.name || 'component row'}`}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={addRow}>
        + Add component
      </button>
    </div>
  );
}
