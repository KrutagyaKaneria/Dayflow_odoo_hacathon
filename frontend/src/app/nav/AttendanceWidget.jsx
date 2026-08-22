function formatTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Compact systray-style control living in the nav shell, per [DESIGN]. `attendance` is
// useTodayAttendance()'s return value, shared with the status dot in TopNav so both reflect the
// same fetch.
export function AttendanceWidget({ attendance }) {
  const { checkedIn, checkedOut, checkInAt, loading, checkIn, checkOut } = attendance;

  if (!checkedIn) {
    return (
      <button type="button" className="attendance-widget attendance-widget--checkin" onClick={checkIn} disabled={loading}>
        Check IN →
      </button>
    );
  }

  if (!checkedOut) {
    return (
      <div className="attendance-widget attendance-widget--active">
        <span className="attendance-widget__since">Since {formatTime(checkInAt)}</span>
        <button type="button" onClick={checkOut} disabled={loading}>
          Check Out →
        </button>
      </div>
    );
  }

  // [INFERENCE] The design draws only "not checked in" and "checked in" states — a settled
  // state for the rest of the day after check-out isn't drawn. Rendering "Check IN →" again
  // would imply a second session is allowed today; it isn't, per D-25's one-session-per-day
  // default, so this renders a disabled, settled state instead.
  return (
    <div className="attendance-widget attendance-widget--done" title="Checked out for today">
      <span>Checked out for today</span>
    </div>
  );
}
