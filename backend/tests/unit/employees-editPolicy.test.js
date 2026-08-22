/**
 * modules/employees/editPolicy — Phase 04. Pure functions/constants, no DB.
 */
const {
  EMPLOYEE_EDITABLE_FIELDS,
  ADMIN_EDITABLE_PROFILE_FIELDS,
  ADMIN_EDITABLE_BANK_FIELDS,
  pickFields,
} = require('../../src/modules/employees/editPolicy');

describe('EMPLOYEE_EDITABLE_FIELDS [RECOMMENDATION pending D-21]', () => {
  test('is exactly the documented default set', () => {
    expect(EMPLOYEE_EDITABLE_FIELDS.slice().sort()).toEqual(
      ['avatarUrl', 'phone', 'residingAddress', 'about', 'jobLikes', 'skills'].sort()
    );
  });

  test('excludes Private Info fields beyond address, and all Bank Details fields', () => {
    const excluded = ['dateOfBirth', 'nationality', 'personalEmail', 'gender', 'maritalStatus', 'accountNumber', 'bankName', 'ifscCode', 'panNo', 'uanNo', 'empCode'];
    for (const field of excluded) {
      expect(EMPLOYEE_EDITABLE_FIELDS).not.toContain(field);
    }
  });
});

describe('ADMIN_EDITABLE_PROFILE_FIELDS', () => {
  test('excludes system/immutable fields', () => {
    const excluded = ['id', 'userId', 'organizationId', 'createdAt', 'updatedAt', 'dateOfJoining', 'managerId'];
    for (const field of excluded) {
      expect(ADMIN_EDITABLE_PROFILE_FIELDS).not.toContain(field);
    }
  });

  test('is a superset of the employee-editable fields', () => {
    for (const field of EMPLOYEE_EDITABLE_FIELDS) {
      expect(ADMIN_EDITABLE_PROFILE_FIELDS).toContain(field);
    }
  });

  test('includes the Private Info fields an employee cannot edit', () => {
    for (const field of ['dateOfBirth', 'nationality', 'personalEmail', 'gender', 'maritalStatus']) {
      expect(ADMIN_EDITABLE_PROFILE_FIELDS).toContain(field);
    }
  });
});

describe('ADMIN_EDITABLE_BANK_FIELDS', () => {
  test('has no overlap with EMPLOYEE_EDITABLE_FIELDS (no employee-editable bank fields)', () => {
    for (const field of ADMIN_EDITABLE_BANK_FIELDS) {
      expect(EMPLOYEE_EDITABLE_FIELDS).not.toContain(field);
    }
  });
});

describe('pickFields', () => {
  test('keeps only allowed keys present in the source', () => {
    const result = pickFields({ phone: '123', nationality: 'IN', extra: 'x' }, ['phone', 'about']);
    expect(result).toEqual({ phone: '123' });
  });

  test('returns an empty object when no allowed keys are present', () => {
    expect(pickFields({ nationality: 'IN' }, ['phone', 'about'])).toEqual({});
  });

  test('does not mutate the source object', () => {
    const source = { phone: '123' };
    pickFields(source, ['phone']);
    expect(source).toEqual({ phone: '123' });
  });
});
