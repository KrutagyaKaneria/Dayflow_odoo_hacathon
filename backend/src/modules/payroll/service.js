const { prisma } = require('../../config/db');
const { PayrollError } = require('./errors');
const { calculateSalary, validateYearlyWage } = require('./calculateSalary');

const VALID_COMPONENT_KINDS = ['earning', 'deduction_employee', 'contribution_employer'];
const VALID_COMPUTATION_TYPES = ['fixed_amount', 'percentage'];
const VALID_PERCENTAGE_BASES = ['wage', 'basic'];

// Same pattern as attendance/leave service.js (Phase 06/07) — payroll attaches to the employee
// profile, not the user.
async function getEmployeeProfileIdByUserId(userId) {
  const profile = await prisma.employeeProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) {
    throw new PayrollError(404, 'PROFILE_NOT_FOUND', 'No employee profile exists for this account.');
  }
  return profile.id;
}

function structureWithComponentsQuery(employeeProfileId) {
  return prisma.salaryStructure.findUnique({
    where: { employeeProfileId },
    include: { components: { orderBy: { displayOrder: 'asc' } } },
  });
}

function toEngineComponents(components) {
  return components.map((c) => ({
    id: c.id,
    name: c.name,
    componentKind: c.componentKind,
    computationType: c.computationType,
    percentageBase: c.percentageBase,
    isBasic: c.isBasic,
    value: Number(c.value),
    description: c.description,
    displayOrder: c.displayOrder,
  }));
}

function computeForStructure(structure) {
  const result = calculateSalary({
    monthlyWage: Number(structure.monthlyWage),
    components: toEngineComponents(structure.components),
  });
  return {
    id: structure.id,
    wageType: structure.wageType,
    monthlyWage: Number(structure.monthlyWage),
    yearlyWage: Number(structure.yearlyWage),
    workingDaysPerWeek: structure.workingDaysPerWeek != null ? Number(structure.workingDaysPerWeek) : null,
    breakTimeHours: structure.breakTimeHours != null ? Number(structure.breakTimeHours) : null,
    components: result.components.map((c) => ({
      id: c.id,
      name: c.name,
      componentKind: c.componentKind,
      computationType: c.computationType,
      percentageBase: c.percentageBase,
      isBasic: c.isBasic,
      value: c.value,
      description: c.description,
      displayOrder: c.displayOrder,
      amount: c.amount,
    })),
    grossSalary: result.grossSalary,
    totalDeductions: result.totalDeductions,
    employerContributions: result.employerContributions,
    netSalary: result.netSalary,
  };
}

async function getForUserId(userId) {
  const employeeProfileId = await getEmployeeProfileIdByUserId(userId);
  const structure = await structureWithComponentsQuery(employeeProfileId);
  if (!structure) {
    throw new PayrollError(404, 'NO_SALARY_STRUCTURE', 'No salary structure has been configured for this employee.');
  }
  return computeForStructure(structure);
}

async function listAll({ search }) {
  const profiles = await prisma.employeeProfile.findMany({
    where: search ? { name: { contains: search, mode: 'insensitive' } } : {},
    select: {
      userId: true,
      name: true,
      salaryStructure: { include: { components: { orderBy: { displayOrder: 'asc' } } } },
    },
    orderBy: { name: 'asc' },
  });

  return profiles.map((profile) => {
    if (!profile.salaryStructure) {
      return { employeeId: profile.userId, name: profile.name, monthlyWage: null, grossSalary: null, netSalary: null };
    }
    const computed = computeForStructure(profile.salaryStructure);
    return {
      employeeId: profile.userId,
      name: profile.name,
      monthlyWage: computed.monthlyWage,
      grossSalary: computed.grossSalary,
      netSalary: computed.netSalary,
    };
  });
}

function validateComponentInput(input, index) {
  const label = `components[${index}]`;
  if (!input || typeof input.name !== 'string' || !input.name.trim()) {
    throw new PayrollError(400, 'VALIDATION_ERROR', `${label}.name is required.`);
  }
  if (!VALID_COMPONENT_KINDS.includes(input.componentKind)) {
    throw new PayrollError(400, 'VALIDATION_ERROR', `${label}.componentKind must be one of ${VALID_COMPONENT_KINDS.join(', ')}.`);
  }
  if (!VALID_COMPUTATION_TYPES.includes(input.computationType)) {
    throw new PayrollError(400, 'VALIDATION_ERROR', `${label}.computationType must be one of ${VALID_COMPUTATION_TYPES.join(', ')}.`);
  }
  if (input.computationType === 'percentage') {
    if (!VALID_PERCENTAGE_BASES.includes(input.percentageBase)) {
      throw new PayrollError(400, 'VALIDATION_ERROR', `${label}.percentageBase is required and must be 'wage' or 'basic' for a percentage component.`);
    }
  } else if (input.percentageBase != null) {
    throw new PayrollError(400, 'VALIDATION_ERROR', `${label}.percentageBase must be omitted for a fixed_amount component.`);
  }
  if (typeof input.value !== 'number' || Number.isNaN(input.value)) {
    throw new PayrollError(400, 'VALIDATION_ERROR', `${label}.value must be a number.`);
  }
  if (typeof input.displayOrder !== 'number' || !Number.isInteger(input.displayOrder)) {
    throw new PayrollError(400, 'VALIDATION_ERROR', `${label}.displayOrder must be an integer.`);
  }
}

function validatePayload(payload) {
  const { monthlyWage, yearlyWage, components } = payload;
  if (typeof monthlyWage !== 'number' || Number.isNaN(monthlyWage) || monthlyWage < 0) {
    throw new PayrollError(400, 'VALIDATION_ERROR', 'monthlyWage must be a non-negative number.');
  }
  if (typeof yearlyWage !== 'number' || Number.isNaN(yearlyWage) || yearlyWage < 0) {
    throw new PayrollError(400, 'VALIDATION_ERROR', 'yearlyWage must be a non-negative number.');
  }
  if (!validateYearlyWage(monthlyWage, yearlyWage)) {
    throw new PayrollError(422, 'YEARLY_WAGE_MISMATCH', 'yearlyWage must equal monthlyWage × 12 — it is never independently editable.');
  }
  if (!Array.isArray(components)) {
    throw new PayrollError(400, 'VALIDATION_ERROR', 'components must be an array.');
  }
  components.forEach(validateComponentInput);
  const basicCount = components.filter((c) => c.isBasic).length;
  if (basicCount > 1) {
    throw new PayrollError(400, 'VALIDATION_ERROR', 'At most one component may be flagged isBasic.');
  }
}

// Read-only computation on a candidate structure — nothing is persisted. Used by the Admin
// screen's live recalculation on wage/component change (POST /payroll/:employeeId/preview).
function preview(payload) {
  validatePayload(payload);
  const result = calculateSalary({
    monthlyWage: payload.monthlyWage,
    components: payload.components.map((c, i) => ({ ...c, id: `preview-${i}`, description: c.description ?? null })),
  });
  if (!result.valid) {
    throw new PayrollError(422, result.errorCode, result.errorMessage);
  }
  return {
    monthlyWage: payload.monthlyWage,
    yearlyWage: payload.yearlyWage,
    workingDaysPerWeek: payload.workingDaysPerWeek ?? null,
    breakTimeHours: payload.breakTimeHours ?? null,
    components: result.components,
    grossSalary: result.grossSalary,
    totalDeductions: result.totalDeductions,
    employerContributions: result.employerContributions,
    netSalary: result.netSalary,
  };
}

// Upsert (create if absent, overwrite if present — D-22). Validates BEFORE persisting: a
// rejected update must leave the prior structure completely untouched. Transactional: replacing
// the component set is a delete-then-insert, and a partial failure leaving an employee with half
// a salary structure is worse than a rejected update.
async function upsertForUserId(targetUserId, payload) {
  validatePayload(payload);

  const engineResult = calculateSalary({
    monthlyWage: payload.monthlyWage,
    components: payload.components.map((c, i) => ({ ...c, id: `candidate-${i}`, description: c.description ?? null })),
  });
  if (!engineResult.valid) {
    // Validated before any write — the transaction below never runs on an invalid payload, so
    // the prior structure (if any) is never touched.
    throw new PayrollError(422, engineResult.errorCode, engineResult.errorMessage);
  }

  const employeeProfileId = await getEmployeeProfileIdByUserId(targetUserId);

  const structure = await prisma.$transaction(async (tx) => {
    const upserted = await tx.salaryStructure.upsert({
      where: { employeeProfileId },
      create: {
        employeeProfileId,
        wageType: 'fixed',
        monthlyWage: payload.monthlyWage,
        yearlyWage: payload.yearlyWage,
        workingDaysPerWeek: payload.workingDaysPerWeek ?? null,
        breakTimeHours: payload.breakTimeHours ?? null,
      },
      update: {
        monthlyWage: payload.monthlyWage,
        yearlyWage: payload.yearlyWage,
        workingDaysPerWeek: payload.workingDaysPerWeek ?? null,
        breakTimeHours: payload.breakTimeHours ?? null,
      },
    });

    await tx.salaryComponent.deleteMany({ where: { salaryStructureId: upserted.id } });
    await tx.salaryComponent.createMany({
      data: payload.components.map((c) => ({
        salaryStructureId: upserted.id,
        name: c.name,
        componentKind: c.componentKind,
        computationType: c.computationType,
        percentageBase: c.computationType === 'percentage' ? c.percentageBase : null,
        isBasic: Boolean(c.isBasic),
        value: c.value,
        description: c.description ?? null,
        displayOrder: c.displayOrder,
      })),
    });

    return tx.salaryStructure.findUnique({
      where: { id: upserted.id },
      include: { components: { orderBy: { displayOrder: 'asc' } } },
    });
  });

  return computeForStructure(structure);
}

module.exports = {
  getForUserId,
  listAll,
  preview,
  upsertForUserId,
  getEmployeeProfileIdByUserId,
};
