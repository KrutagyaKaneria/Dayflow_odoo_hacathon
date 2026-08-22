import { RequireRole } from '../../app/auth';
import { EmployeeTimeOffPage } from './EmployeeTimeOffPage';
import { AdminTimeOffPage } from './AdminTimeOffPage';

// Replaces Phase 05's /time-off placeholder. Role-branched via Phase 03's <RequireRole> —
// fourth real usage of a Phase 03 frontend primitive (after Phase 05's directory NEW button and
// Phase 06's Admin/Employee attendance branch). UX convenience only: GET /leaves vs.
// GET /leaves/me (requireRole('admin_hr') server-side) is the actual boundary.
export function TimeOffPage() {
  return (
    <RequireRole roles={['admin_hr']} fallback={<EmployeeTimeOffPage />}>
      <AdminTimeOffPage />
    </RequireRole>
  );
}
