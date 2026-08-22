// Display-only mirror of the backend's leavePolicy.js countDays() (D-30: inclusive counting) —
// used for the request modal's live Allocation preview before submission. The backend
// recomputes and is authoritative; this is never trusted for anything but the preview.
export function previewDayCount(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays + 1; // inclusive — see backend leavePolicy.js D-30
}
