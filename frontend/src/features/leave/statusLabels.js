// [INFERENCE] Presentation-layer mapping ONLY — the database and API use the PDF's enum
// (pending/approved/rejected). The calendar legend and Admin table render the design's labels
// via this single mapping constant; nothing else in the frontend or backend re-derives these
// strings. See leavePolicy.js's matching comment on the backend side for the full reasoning.
// TODO: if "Validated"/"To Approve"/"Refused" are genuinely distinct concepts rather than
// display labels for the same three states, this mapping is wrong and the fix is a schema
// change, not a label change.
export const STATUS_LABELS = {
  pending: 'To Approve',
  approved: 'Validated',
  rejected: 'Refused',
};

export const LEAVE_TYPE_LABELS = {
  paid_time_off: 'Paid time off',
  sick_leave: 'Sick Leave',
  unpaid_leave: 'Unpaid Leaves',
};
