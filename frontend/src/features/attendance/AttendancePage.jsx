import { RequireRole } from '../../app/auth';
import { EmployeeAttendancePage } from './EmployeeAttendancePage';
import { AdminAttendancePage } from './AdminAttendancePage';

// Replaces Phase 05's /attendance placeholder. Role-branched via Phase 03's <RequireRole> —
// third real usage of a Phase 03 frontend primitive. This is UX convenience only, same caveat
// as everywhere else RequireRole is used: GET /attendance (requireRole('admin_hr') server-side)
// is the actual boundary, not this branch.
export function AttendancePage() {
  return (
    <RequireRole roles={['admin_hr']} fallback={<EmployeeAttendancePage />}>
      <AdminAttendancePage />
    </RequireRole>
  );
}
