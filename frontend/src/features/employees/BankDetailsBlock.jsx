// Bank Details are always rendered read-only in this phase's frontend — Admin's ability to edit
// them exists at the API level (PATCH /employees/:id, tested in the backend suite) but no
// "edit someone else's profile" UI is built (see ProfilePage.jsx's D-14-follow-up TODO — still
// open, separate from D-14 itself, which is resolved), and employees can never edit their own
// Bank Details (see editPolicy.js — no bank fields are in EMPLOYEE_EDITABLE_FIELDS). This block
// is also never even reached for a coworker viewer under [D-14 RESOLVED] — it lives inside
// PrivateInfoTab, which computeTabSet excludes entirely for that case.
export function BankDetailsBlock({ bankDetails }) {
  const rows = [
    ['Bank Name', bankDetails?.bankName],
    ['Account Number', bankDetails?.accountNumber],
    ['IFSC Code', bankDetails?.ifscCode],
    ['PAN No.', bankDetails?.panNo],
    ['UAN No.', bankDetails?.uanNo],
    ['Employee Code', bankDetails?.empCode],
  ];

  return (
    <div className="bank-details-block">
      <h3>Bank Details</h3>
      <dl>
        {rows.map(([label, value]) => (
          <div className="bank-details-block__row" key={label}>
            <dt>{label}</dt>
            <dd>{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
