// R-D08: green only while an open (checked-in, not yet checked-out) session exists.
// [INFERENCE] The design specifies red->green on check-in but no color change on check-out;
// this reverts to red on check-out, since staying green all day would misrepresent "currently
// in office" — the meaning the design's own employee-card legend assigns to green.
//
// Kept in its own dependency-free module (no JSX, no react-router-dom) so it's directly
// testable without pulling in TopNav.jsx's router imports — see scripts/smoke-attendance.mjs.
export function isNavStatusDotGreen(attendance) {
  return Boolean(attendance.checkedIn && !attendance.checkedOut);
}
