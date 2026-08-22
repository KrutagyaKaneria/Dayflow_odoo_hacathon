/**
 * Phase 08 — pure salary calculation engine. No database access. Takes a wage plus a component
 * set and returns computed figures. This is the ONLY place component amounts are computed —
 * routes.js/service.js must call this, never recompute inline, and the frontend must call
 * POST /payroll/:employeeId/preview rather than reimplementing this in JavaScript.
 */
const { round2, WAGE_CONSTRAINT_INCLUDES_DEDUCTIONS } = require('./payrollPolicy');

// Order of operations (per the phase spec):
//   1. Resolve wage-based percentage components and all fixed-amount components.
//   2. Resolve basic-based percentage components, using the Basic figure from step 1.
//   3. Sum earnings -> grossSalary. Sum deduction_employee -> totalDeductions. Sum
//      contribution_employer separately.
//   4. netSalary = grossSalary - totalDeductions.
//   5. Validate the wage constraint per D-34.
//
// Rounding: each component is rounded to 2dp at computation, then summed — never sum unrounded
// and round the total, or displayed lines won't add up to the displayed total (the design's
// 2082.50 confirms 2dp component precision).
function calculateSalary({ monthlyWage, components }) {
  const wage = Number(monthlyWage);

  const basicCandidates = components.filter((c) => c.isBasic);
  if (basicCandidates.length > 1) {
    return {
      valid: false,
      errorCode: 'MULTIPLE_BASIC_COMPONENTS',
      errorMessage: 'Only one component may be flagged as Basic.',
      components: [],
    };
  }
  const basicComponent = basicCandidates[0] || null;

  // Self-referential base: Basic cannot derive its own percentage from Basic — that's not a
  // loop the two-pass algorithm can resolve, it's a logical impossibility. Reject with a
  // validation error rather than looping or silently treating basic as 0.
  if (basicComponent && basicComponent.computationType === 'percentage' && basicComponent.percentageBase === 'basic') {
    return {
      valid: false,
      errorCode: 'SELF_REFERENTIAL_PERCENTAGE_BASE',
      errorMessage: 'The Basic component cannot compute its percentage from Basic itself.',
      components: [],
    };
  }

  const hasBasicBasedComponents = components.some(
    (c) => c.computationType === 'percentage' && c.percentageBase === 'basic'
  );
  if (hasBasicBasedComponents && !basicComponent) {
    return {
      valid: false,
      errorCode: 'MISSING_BASIC_COMPONENT',
      errorMessage: 'A component derives its percentage from Basic, but no component is flagged as Basic.',
      components: [],
    };
  }

  // Pass 1: fixed amounts and wage-based percentages (includes Basic, since Basic is
  // percentage-of-wage per the seeded default — see payrollPolicy.js D-35).
  const amounts = new Map();
  for (const c of components) {
    if (c.computationType === 'fixed_amount') {
      amounts.set(c, round2(Number(c.value)));
    } else if (c.computationType === 'percentage' && c.percentageBase === 'wage') {
      amounts.set(c, round2((wage * Number(c.value)) / 100));
    }
  }

  const basicAmount = basicComponent ? amounts.get(basicComponent) : 0;

  // Pass 2: basic-based percentages, using the Basic figure resolved in pass 1.
  for (const c of components) {
    if (c.computationType === 'percentage' && c.percentageBase === 'basic') {
      amounts.set(c, round2(((basicAmount || 0) * Number(c.value)) / 100));
    }
  }

  const lineItems = components
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((c) => ({ ...c, amount: amounts.get(c) }));

  const grossSalary = round2(lineItems.filter((c) => c.componentKind === 'earning').reduce((sum, c) => sum + c.amount, 0));
  const totalDeductions = round2(
    lineItems.filter((c) => c.componentKind === 'deduction_employee').reduce((sum, c) => sum + c.amount, 0)
  );
  const employerContributions = round2(
    lineItems.filter((c) => c.componentKind === 'contribution_employer').reduce((sum, c) => sum + c.amount, 0)
  );
  const netSalary = round2(grossSalary - totalDeductions);

  // D-34: earnings only, unless WAGE_CONSTRAINT_INCLUDES_DEDUCTIONS is flipped.
  const constraintTotal = round2(grossSalary + (WAGE_CONSTRAINT_INCLUDES_DEDUCTIONS ? totalDeductions : 0));
  const result = { components: lineItems, grossSalary, totalDeductions, employerContributions, netSalary };

  if (constraintTotal > wage + 0.005) {
    return {
      ...result,
      valid: false,
      errorCode: 'WAGE_CONSTRAINT_EXCEEDED',
      errorMessage: `Total components (₹${constraintTotal}) exceed the defined wage (₹${wage}).`,
    };
  }

  return { ...result, valid: true };
}

// Structure-level validation, separate from component calculation: yearly_wage must equal
// monthly_wage × 12, never independently editable/drifting.
function validateYearlyWage(monthlyWage, yearlyWage) {
  const expected = round2(Number(monthlyWage) * 12);
  return Math.abs(expected - round2(Number(yearlyWage))) < 0.01;
}

module.exports = { calculateSalary, validateYearlyWage };
