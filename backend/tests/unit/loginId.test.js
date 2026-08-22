/**
 * Login ID generator — Phase 02, Path A. Pure function, no DB.
 */
const { generateLoginId, companyCode, twoLetters } = require('../../src/modules/auth/loginId');

describe('generateLoginId', () => {
  test('matches the design worked example exactly (OIJODO20220001)', () => {
    const loginId = generateLoginId({
      companyName: 'Odoo India',
      firstName: 'John',
      lastName: 'Doe',
      joinYear: 2022,
      serialNumber: 1,
    });
    expect(loginId).toBe('OIJODO20220001');
  });

  test('pads the serial number to 4 digits', () => {
    const loginId = generateLoginId({
      companyName: 'Odoo India',
      firstName: 'John',
      lastName: 'Doe',
      joinYear: 2022,
      serialNumber: 23,
    });
    expect(loginId).toBe('OIJODO20220023');
  });

  test('uppercases lowercase name/company input', () => {
    const loginId = generateLoginId({
      companyName: 'odoo india',
      firstName: 'john',
      lastName: 'doe',
      joinYear: 2022,
      serialNumber: 1,
    });
    expect(loginId).toBe('OIJODO20220001');
  });

  test('single-word company name falls back to literal first two letters', () => {
    expect(companyCode('Acme')).toBe('AC');
    expect(companyCode('acme corp')).toBe('AC'); // multi-word: first letter of first two words
  });

  test('twoLetters handles short and empty input without throwing', () => {
    expect(twoLetters('A')).toBe('A');
    expect(twoLetters('')).toBe('');
    expect(twoLetters(undefined)).toBe('');
  });

  test('two different serial numbers for the same initials/year produce distinct login ids', () => {
    const base = { companyName: 'Odoo India', firstName: 'John', lastName: 'Doe', joinYear: 2022 };
    const first = generateLoginId({ ...base, serialNumber: 1 });
    const second = generateLoginId({ ...base, serialNumber: 2 });
    expect(first).not.toBe(second);
  });
});
