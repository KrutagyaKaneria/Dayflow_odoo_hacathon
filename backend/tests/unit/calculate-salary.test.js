/**
 * modules/payroll/calculateSalary — Phase 08. Pure functions, no DB.
 */
const { calculateSalary, validateYearlyWage } = require('../../src/modules/payroll/calculateSalary');

// The design's seeded example component set — see src/db/seeds/dev-seed.js for the persisted
// version. Order mirrors the design's display order.
function designComponentSet() {
  return [
    { id: 'basic', name: 'Basic Salary', componentKind: 'earning', computationType: 'percentage', percentageBase: 'wage', isBasic: true, value: 50, displayOrder: 1 },
    { id: 'hra', name: 'House Rent Allowance', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 50, displayOrder: 2 },
    { id: 'std', name: 'Standard Allowance', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 16.67, displayOrder: 3 },
    { id: 'perf', name: 'Performance Bonus', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 8.33, displayOrder: 4 },
    { id: 'lta', name: 'Leave Travel Allowance', componentKind: 'earning', computationType: 'fixed_amount', percentageBase: null, isBasic: false, value: 1250, displayOrder: 5 },
    { id: 'pf-emp', name: 'PF (Employee)', componentKind: 'deduction_employee', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 12, displayOrder: 6 },
    { id: 'pf-empr', name: 'PF (Employer)', componentKind: 'contribution_employer', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 12, displayOrder: 7 },
    { id: 'ptax', name: 'Professional Tax', componentKind: 'deduction_employee', computationType: 'fixed_amount', percentageBase: null, isBasic: false, value: 200, displayOrder: 8 },
  ];
}

function amountOf(result, id) {
  return result.components.find((c) => c.id === id).amount;
}

describe("design's full worked example (D-35 decisive test)", () => {
  // Named per the phase spec. If this fails, D-35's percentage-base interpretation is wrong —
  // stop and report rather than adjusting the test to match the code.
  //
  // One deliberate, reported divergence from the phase prompt's own summary line: Standard
  // Allowance is asserted here at 4167.50, not the flat "4167" the prompt's acceptance-criteria
  // text showed. 25000 * 16.67% = 4167.50 exactly; rounding that to 2dp (as instructed, and as
  // the sibling figure 2082.50 already demonstrates for Performance Bonus) cannot produce a
  // whole number without an inconsistent per-line rounding rule with no stated justification.
  // This is treated as a formatting slip in the prompt's own text, not a different D-35 reading
  // — see the phase report for the full explanation.
  test('wage 50000 reproduces every figure exactly (with the above noted formatting caveat)', () => {
    const result = calculateSalary({ monthlyWage: 50000, components: designComponentSet() });

    expect(result.valid).toBe(true);
    expect(amountOf(result, 'basic')).toBe(25000);
    expect(amountOf(result, 'hra')).toBe(12500);
    expect(amountOf(result, 'std')).toBe(4167.5);
    expect(amountOf(result, 'perf')).toBe(2082.5);
    expect(amountOf(result, 'pf-emp')).toBe(3000);
    expect(amountOf(result, 'pf-empr')).toBe(3000);
    expect(amountOf(result, 'ptax')).toBe(200);
  });

  test('gross/net/employer-cost separation per D-36', () => {
    const result = calculateSalary({ monthlyWage: 50000, components: designComponentSet() });
    // gross = 25000 + 12500 + 4167.50 + 2082.50 + 1250 (LTA)
    expect(result.grossSalary).toBe(45000);
    // deductions = PF employee 3000 + Professional Tax 200
    expect(result.totalDeductions).toBe(3200);
    expect(result.netSalary).toBe(41800);
    // employer contribution (PF employer) never subtracts from net
    expect(result.employerContributions).toBe(3000);
  });
});

describe('auto-update on wage change (cascade through Basic)', () => {
  test('doubling the wage doubles Basic and cascades to basic-based components', () => {
    const doubled = calculateSalary({ monthlyWage: 100000, components: designComponentSet() });
    expect(doubled.valid).toBe(true);
    expect(amountOf(doubled, 'basic')).toBe(50000);
    expect(amountOf(doubled, 'hra')).toBe(25000); // 50% of the new 50000 Basic
    expect(amountOf(doubled, 'std')).toBe(8335); // 16.67% of 50000
  });
});

describe('wage constraint — D-34', () => {
  const wageBased = (value) => ({
    id: 'basic', name: 'Basic', componentKind: 'earning', computationType: 'percentage', percentageBase: 'wage', isBasic: true, value, displayOrder: 1,
  });

  test('a component set summing to exactly the wage passes', () => {
    const result = calculateSalary({ monthlyWage: 50000, components: [wageBased(100)] });
    expect(result.valid).toBe(true);
    expect(result.grossSalary).toBe(50000);
  });

  test('one cent over the wage fails with WAGE_CONSTRAINT_EXCEEDED', () => {
    const components = [
      wageBased(100),
      { id: 'extra', name: 'Extra', componentKind: 'earning', computationType: 'fixed_amount', percentageBase: null, isBasic: false, value: 0.01, displayOrder: 2 },
    ];
    const result = calculateSalary({ monthlyWage: 50000, components });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('WAGE_CONSTRAINT_EXCEEDED');
  });

  test('deductions are excluded from the constraint by default (WAGE_CONSTRAINT_INCLUDES_DEDUCTIONS = false)', () => {
    const components = [
      wageBased(100),
      { id: 'pf', name: 'PF', componentKind: 'deduction_employee', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 50, displayOrder: 2 },
    ];
    // Basic = 50000 (100% of wage), PF = 25000 (50% of basic) — earnings-only total is still
    // exactly 50000, so this passes even though earnings + PF would exceed the wage.
    const result = calculateSalary({ monthlyWage: 50000, components });
    expect(result.valid).toBe(true);
  });
});

describe('self-referential percentage base', () => {
  test('Basic with percentage_base "basic" -> a validation error, not a stack overflow or infinite loop', () => {
    const components = [
      { id: 'basic', name: 'Basic', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: true, value: 50, displayOrder: 1 },
    ];
    const result = calculateSalary({ monthlyWage: 50000, components });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('SELF_REFERENTIAL_PERCENTAGE_BASE');
  });

  test('a basic-based component with no component flagged isBasic -> a validation error', () => {
    const components = [
      { id: 'hra', name: 'HRA', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 50, displayOrder: 1 },
    ];
    const result = calculateSalary({ monthlyWage: 50000, components });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('MISSING_BASIC_COMPONENT');
  });
});

describe('rounding', () => {
  test('component-level 2dp rounding sums to the displayed total exactly', () => {
    const result = calculateSalary({ monthlyWage: 50000, components: designComponentSet() });
    const earningsSum = result.components.filter((c) => c.componentKind === 'earning').reduce((s, c) => s + c.amount, 0);
    expect(Math.round(earningsSum * 100) / 100).toBe(result.grossSalary);
  });
});

describe('validateYearlyWage', () => {
  test('matches when yearly = monthly * 12', () => {
    expect(validateYearlyWage(50000, 600000)).toBe(true);
  });

  test('rejects a mismatch', () => {
    expect(validateYearlyWage(50000, 500000)).toBe(false);
  });
});
