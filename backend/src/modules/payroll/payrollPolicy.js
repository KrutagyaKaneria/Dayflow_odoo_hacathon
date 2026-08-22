/**
 * Phase 08 — centralized payroll policy. Every open-decision value this phase had to pick a
 * default for lives here — no percentage base, currency, or constraint literal appears anywhere
 * else in the codebase. Follows the EMPLOYEE_EDITABLE_FIELDS (Phase 04) / attendancePolicy.js
 * (Phase 06) / leavePolicy.js (Phase 07) precedent.
 */

// [RECOMMENDATION resolving D-03] Interpretation adopted: an employee CAN VIEW their own salary
// structure but CANNOT EDIT it; only Admin/HR can view another employee's salary, and only
// Admin/HR can edit any salary.
//
// Reasoning, so a reviewer can disagree with the reasoning rather than the outcome: the design's
// note reads "Salary Info tab Should only be visible to Admin", but it is attached to the
// ADMIN's own-profile screenshot, and the EMPLOYEE's own-profile screenshot in the same board
// also shows a Salary Info tab. Read literally as "invisible even on one's own profile", the
// note contradicts the screenshot drawn beside it. [PDF §3.6.1] independently states payroll
// data is "read-only for employees" — which presupposes employees can see it. The reading where
// both sources are simultaneously true is: visibility of one's OWN salary is universal;
// visibility of OTHERS' salary and edit rights of ANY salary are Admin-only.
//
// This is a SECURITY BOUNDARY, not a display preference — enforced server-side (routes.js) and
// proven by an RBAC test, per Security Baseline §5.1/§5.8, never by hiding a frontend tab.
// TODO(D-03): if the stricter reading is confirmed instead (employees never see salary at all),
// the change is a single guard swap on GET /payroll/me plus hiding the tab — the calculation
// engine and schema are unaffected either way.
const EMPLOYEE_CAN_VIEW_OWN_SALARY = true;

// [RECOMMENDATION pending D-35] What a "percentage" component is a percentage OF. The design
// labels the computation type "Percentage of Wage", but its own worked figures contradict that
// label for every component except Basic:
//   Basic             50%    of WAGE  50000 = 25000    ✅ matches "of Wage"
//   HRA               50%    of BASIC 25000 = 12500    ❌ not of wage (would be 25000)
//   Standard Allow.   16.67% of BASIC 25000 =  4167.50 ❌ not of wage (would be 8335)
//   Performance Bonus  8.33% of BASIC 25000 =  2082.50 ❌ not of wage (would be 4165)
//   PF (each)         12%    of BASIC 25000 =  3000    ❌ not of wage (would be 6000)
// The design's own explanatory note confirms the mixed base explicitly: "If Wage = 50,000 and
// Basic = 50% of wage, then Basic = 25,000. If HRA = 50% of Basic, then HRA = 12,500."
//
// This phase therefore models the base as an EXPLICIT PER-COMPONENT FIELD (percentageBase:
// 'wage' | 'basic') rather than a single global rule, since the source demonstrably uses both.
// Seeded defaults reproduce the design's figures exactly: Basic -> 'wage', everything else ->
// 'basic'.
// TODO(D-35): confirm. If the base is meant to be uniformly 'wage', every component value in the
// design's mockup is wrong and the engine's output will differ from the mockup by ~2x on most
// lines.
const PERCENTAGE_BASES = ['wage', 'basic'];
const DEFAULT_PERCENTAGE_BASE = 'basic';

// [RECOMMENDATION pending D-34] The design states "The total of all components should not
// exceed the defined Wage." It does not say whether deductions (PF employee contribution,
// Professional Tax) are "components" for the purposes of that ceiling.
// This phase counts EARNINGS ONLY toward the constraint (Basic, HRA, Standard Allowance,
// Performance Bonus, LTA), excluding PF and Professional Tax. Reasoning: PF-employer is an
// employer cost that is not paid out of the wage at all, and PF-employee and Professional Tax
// are subtractions FROM pay, so including them in a ceiling on pay conflates two directions of
// money.
// TODO(D-34): confirm. If deductions DO count, the headroom for additional earnings shrinks and
// some otherwise-valid structures start failing validation.
const WAGE_CONSTRAINT_INCLUDES_DEDUCTIONS = false;

// [RECOMMENDATION pending D-36] Neither source defines gross or net pay. The design describes
// Professional Tax as "deducted from the Gross salary", which is the only mention of "gross"
// anywhere and defines nothing.
// This phase computes and returns:
//   grossSalary      = sum of EARNINGS components (per D-34's earnings set)
//   totalDeductions  = PF (employee share) + Professional Tax
//   netSalary        = grossSalary - totalDeductions
// PF employer share is returned separately as an employer cost and is NOT subtracted from net —
// it never passes through the employee's pay.
// TODO(D-36): confirm. This is the shape a payslip would need (Future Enhancement, [PDF §6]), so
// it is deliberately computed here but NOT rendered as any payslip-like document.

// [RECOMMENDATION pending D-22] Salary updates OVERWRITE in place. No versioning, no effective
// dates, no history table.
// Reasoning: neither source requests history, and building effective-dated salary versioning is
// a substantial data model (period-scoped lookups, "which structure applied on date X"
// resolution) that would be invented wholesale.
// The cost of this default is real and must be stated plainly: once Phase 09 computes payable
// days and multiplies by a wage, a mid-month salary change will silently reprice the whole
// month, and there will be no record of the prior figure.
// TODO(D-22): if payroll history matters at all — and for a real HRMS it almost certainly does —
// decide BEFORE Phase 09, because retrofitting history after a payroll figure has been computed
// against an overwritten structure means the earlier number can never be reconstructed.
const ENABLE_SALARY_VERSIONING = false;

// NOTE: D-23 (audit log) is a Phase 10 decision and is NOT built here. Read together with the
// overwrite default above, that means salary changes are currently untracked in both directions
// — no version history AND no audit trail. Flagged, not solved. This is the single largest
// data-loss exposure in the system as currently planned.

// [RECOMMENDATION pending D-37] Currency is declared as a single constant 'INR', not stored per-
// record and not user-selectable. The design shows the rupee symbol throughout but never
// declares currency as a field, and the Global Implementation Checklist (§6) already flags
// currency as [UNCLEAR]. Amounts are stored as numeric, never as formatted strings. Symbol
// rendering is a frontend presentation concern.
// TODO(D-37): confirm before any multi-currency or multi-country requirement appears — a
// per-organization currency field would be the natural shape given Phase 01's organizations table.
const CURRENCY = 'INR';

// [OPEN QUESTION, unchanged from the original PDF analysis] "Ensure payroll accuracy" [PDF
// §3.6.2] is procedural language, not a described feature. This phase interprets it as satisfied
// by the wage-constraint validation and the calculation engine's determinism. No audit log, no
// approval workflow, and no reconciliation report is built on the strength of this phrase alone.
// TODO: confirm nothing more concrete was intended.

const EARNING_KINDS = ['earning'];
const DEDUCTION_EMPLOYEE_KIND = 'deduction_employee';
const CONTRIBUTION_EMPLOYER_KIND = 'contribution_employer';

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

module.exports = {
  EMPLOYEE_CAN_VIEW_OWN_SALARY,
  PERCENTAGE_BASES,
  DEFAULT_PERCENTAGE_BASE,
  WAGE_CONSTRAINT_INCLUDES_DEDUCTIONS,
  ENABLE_SALARY_VERSIONING,
  CURRENCY,
  EARNING_KINDS,
  DEDUCTION_EMPLOYEE_KIND,
  CONTRIBUTION_EMPLOYER_KIND,
  round2,
};
