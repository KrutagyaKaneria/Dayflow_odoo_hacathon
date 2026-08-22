# Phase 11 — Notifications & Reports (deferred)

Documentation only. No code, table, scheduler, or third-party integration exists for anything
below — this file exists so the scope and open gating decisions are recorded somewhere, not lost
between phases. Verified clean (Phase 10/11 pass, 2026-08-22): no `notifications`/`reports` table
or module, no cron/queue/scheduler package or code, no email/SMS library or integration beyond
what D-19 explicitly authorized (see backend/src/modules/auth/service.js — provisioning still
returns the initial password once, synchronously, in the API response; no delivery mechanism was
built).

## Scope, if/when this phase is picked up

- **Notifications / alerts.** [PDF §3.2.1]'s "recent activity or alerts" panel on the Directory
  page is stubbed, not built — see `frontend/src/features/employees/DirectoryPage.jsx`'s
  `[RECOMMENDATION pending D-24]` comment. D-24 is still OPEN.
- **Reports / analytics dashboard.** No report scope, format, or audience is specified by either
  source document. Not started.
- **Salary-slip document generation.** `modules/integration/payableDays.js` computes payable days
  (Phase 09); `payrollPolicy.js` computes gross/net figures (Phase 08) — both stop short of
  rendering a payslip-like document on purpose. [PDF §6] defers "salary slips" explicitly.
- **Attendance-report document generation.** Not started. No source document specifies a format.

## Gating decisions this phase would need resolved first

1. **D-24 fold-in question.** Does "recent activity/alerts" get folded into a future Reports
   module, or built as its own minimal always-on Directory panel? Affects whether D-24 is closed
   independently of the rest of this phase's scope.
2. **Email-transport sequencing.** D-19 (initial-password delivery, resolved Phase 10 as
   non-production acceptance — see auth/service.js) is the natural place a real email transport
   would first get introduced, if it ever is. Any notification feature that needs email should
   sequence behind that decision, not stand up a second, parallel email integration.
3. **Salary-slip vs. payable-days boundary.** Phase 09's payable-days figure and Phase 08's
   gross/net calculation are reusable inputs to a payslip, but neither is a payslip. Where exactly
   the line sits (raw figures vs. a rendered/downloadable document, PDF vs. HTML, historical
   snapshot vs. always-recomputed) needs a decision before building.
4. **Report scope and format.** Neither source document specifies what a "report" contains, who
   it's for (Admin-only vs. also Employee-facing), or its output format (in-app view, CSV export,
   PDF). This needs to be scoped from a real requirement, not invented here.
