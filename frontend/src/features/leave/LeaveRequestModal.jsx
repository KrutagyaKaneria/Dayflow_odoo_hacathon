import { useEffect, useState } from 'react';
import { useAuth } from '../../app/auth';
import { fetchMyProfile } from '../employees/api';
import { submitLeave, uploadAttachment } from './api';
import { previewDayCount } from './dayCount';
import { LEAVE_TYPE_LABELS } from './statusLabels';

const LEAVE_TYPE_OPTIONS = Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => ({ value, label }));

// [DESIGN] R-D15: Time off Type Request modal — Employee, Time off Type, Validity Period,
// Allocation, Attachment, Remarks, Submit/Discard.
export function LeaveRequestModal({ onClose, onSubmitted }) {
  const { accessToken } = useAuth();
  const [employeeName, setEmployeeName] = useState(null);
  const [leaveType, setLeaveType] = useState('paid_time_off');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    fetchMyProfile(accessToken)
      .then((data) => setEmployeeName(data.profile.name))
      .catch(() => setEmployeeName(null));
  }, [accessToken]);

  const allocation = previewDayCount(startDate, endDate);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      let attachmentUrl;
      if (file) {
        const uploadRes = await uploadAttachment(accessToken, file);
        attachmentUrl = uploadRes.attachmentUrl;
      }
      const res = await submitLeave(accessToken, {
        leaveType,
        startDate,
        endDate,
        remarks: remarks || undefined,
        attachmentUrl,
      });
      onSubmitted(res.record);
      if (res.exceedsBalance) {
        // Non-blocking warning, per D-08 — the request is already submitted at this point.
        setWarning('This request exceeds your available balance. It has still been submitted.');
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="leave-modal__backdrop" role="dialog" aria-modal="true">
      <div className="leave-modal">
        <h2>Time off Type Request</h2>
        <form onSubmit={handleSubmit}>
          {/* Employee: pre-filled, read-only, current user — display only, never sent to the API
              (the backend always resolves the target from the access token). */}
          <label>
            Employee
            <input value={employeeName || 'You'} readOnly disabled />
          </label>
          <label>
            Time off Type
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
              {LEAVE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <div className="leave-modal__dates">
            <label>
              From
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </label>
            <label>
              To
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </label>
          </div>
          {/* TODO(D-30): the design's example implies this might be manually editable rather
              than computed. Rendered read-only here per the inclusive-counting default. */}
          <label>
            Allocation
            <input value={allocation != null ? `${allocation.toFixed(2)} Days` : '—'} readOnly disabled />
          </label>
          <label>
            Attachment <span className="leave-modal__hint">(For sick leave certificate)</span>
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          {/* [PDF §3.5.1] — not drawn in the design; see D-04 reasoning in leavePolicy.js. */}
          <label>
            Remarks
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </label>
          {error && <p className="leave-modal__error">{error}</p>}
          {warning && <p className="leave-modal__warning">{warning}</p>}
          <div className="leave-modal__actions">
            <button type="button" onClick={onClose} disabled={submitting}>
              Discard
            </button>
            <button type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
