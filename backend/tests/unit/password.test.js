/**
 * Password hashing, initial-password generation, and policy validation — Phase 02.
 */
const {
  hashPassword,
  verifyPassword,
  generateInitialPassword,
  validatePasswordPolicy,
} = require('../../src/modules/auth/password');

describe('hashPassword / verifyPassword', () => {
  test('round-trips: verifies the correct plaintext against its own hash', async () => {
    const hash = await hashPassword('correct-horse-1');
    await expect(verifyPassword('correct-horse-1', hash)).resolves.toBe(true);
  });

  test('rejects an incorrect plaintext', async () => {
    const hash = await hashPassword('correct-horse-1');
    await expect(verifyPassword('wrong-password-1', hash)).resolves.toBe(false);
  });

  test('never stores the plaintext in the hash output', async () => {
    const plaintext = 'correct-horse-1';
    const hash = await hashPassword(plaintext);
    expect(hash).not.toContain(plaintext);
  });
});

describe('generateInitialPassword', () => {
  test('produces a sufficiently long, non-predictable value', () => {
    const a = generateInitialPassword();
    const b = generateInitialPassword();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThanOrEqual(20);
    expect(a).not.toBe(b); // crypto.randomBytes-backed, not a fixed value
  });
});

describe('validatePasswordPolicy [RECOMMENDATION pending D-16]', () => {
  test.each([
    ['Passw0rd', true],
    ['short1', false], // < 8 chars
    ['alllettersnodigit', false], // no digit
    ['12345678', false], // no letter
    ['Passw0rd!', true],
  ])('%s -> %s', (password, expected) => {
    expect(validatePasswordPolicy(password)).toBe(expected);
  });

  test('rejects non-string input', () => {
    expect(validatePasswordPolicy(undefined)).toBe(false);
    expect(validatePasswordPolicy(12345678)).toBe(false);
  });
});
