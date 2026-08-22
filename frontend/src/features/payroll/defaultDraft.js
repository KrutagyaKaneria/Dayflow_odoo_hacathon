// Starting point for an Admin creating a fresh salary structure — mirrors the design's worked
// example (see backend/src/db/seeds/dev-seed.js's DESIGN_SALARY_COMPONENTS for the authoritative
// version). Purely a UI convenience for pre-filling the create form; the backend recomputes and
// validates everything regardless of what's submitted.
export function defaultDraft() {
  return {
    monthlyWage: 50000,
    yearlyWage: 600000,
    workingDaysPerWeek: 5,
    breakTimeHours: 1,
    components: [
      { name: 'Basic Salary', componentKind: 'earning', computationType: 'percentage', percentageBase: 'wage', isBasic: true, value: 50, description: '50% of Wage', displayOrder: 1 },
      { name: 'House Rent Allowance', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 50, description: '50% of Basic', displayOrder: 2 },
      { name: 'Standard Allowance', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 16.67, description: '16.67% of Basic', displayOrder: 3 },
      { name: 'Performance Bonus', componentKind: 'earning', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 8.33, description: '8.33% of Basic', displayOrder: 4 },
      { name: 'Leave Travel Allowance', componentKind: 'earning', computationType: 'fixed_amount', percentageBase: null, isBasic: false, value: 1250, description: 'Fixed', displayOrder: 5 },
      { name: 'PF (Employee)', componentKind: 'deduction_employee', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 12, description: '12% of Basic', displayOrder: 6 },
      { name: 'PF (Employer)', componentKind: 'contribution_employer', computationType: 'percentage', percentageBase: 'basic', isBasic: false, value: 12, description: 'Employer cost', displayOrder: 7 },
      { name: 'Professional Tax', componentKind: 'deduction_employee', computationType: 'fixed_amount', percentageBase: null, isBasic: false, value: 200, description: 'From Gross', displayOrder: 8 },
    ],
  };
}
