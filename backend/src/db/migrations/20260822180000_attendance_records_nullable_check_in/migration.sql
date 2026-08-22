-- Migration: attendance_records_nullable_check_in
-- Phase 09 — Cross-Module Integration, Part B (Leave→Attendance sync).
--
-- Phase 06 made check_in_at NOT NULL because every row it ever wrote came from an observed
-- check-in event. Phase 09 introduces a second writer: approved-leave sync, which creates a
-- LEAVE-status row with NO observed check-in at all (see modules/integration/
-- syncLeaveApprovalToAttendance.js). check_in_at must become nullable to represent that
-- truthfully — a synthetic timestamp would be worse than NULL, since it would claim an
-- observation that never happened.
ALTER TABLE "attendance_records" ALTER COLUMN "check_in_at" DROP NOT NULL;
