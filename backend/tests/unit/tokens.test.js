/**
 * JWT access-token sign/verify and opaque-token generation/hashing — Phase 02.
 */
const jwt = require('jsonwebtoken');
const {
  signAccessToken,
  verifyAccessToken,
  generateOpaqueToken,
  hashToken,
} = require('../../src/modules/auth/tokens');

const testUser = { id: 'user-1', role: 'employee', organizationId: 'org-1' };

describe('signAccessToken / verifyAccessToken', () => {
  test('round-trips: verify recovers the signed subject, role, and organizationId', () => {
    const token = signAccessToken(testUser);
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe(testUser.id);
    expect(payload.role).toBe(testUser.role);
    expect(payload.organizationId).toBe(testUser.organizationId);
  });

  test('rejects a token signed with a different secret', () => {
    const bogusToken = jwt.sign({ sub: testUser.id, role: testUser.role }, 'not-the-real-secret');
    expect(() => verifyAccessToken(bogusToken)).toThrow();
  });

  test('rejects a tampered token', () => {
    const token = signAccessToken(testUser);
    const tampered = `${token.slice(0, -1)}${token.slice(-1) === 'a' ? 'b' : 'a'}`;
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  test('null organizationId is preserved through sign/verify', () => {
    const token = signAccessToken({ ...testUser, organizationId: null });
    const payload = verifyAccessToken(token);
    expect(payload.organizationId).toBeNull();
  });
});

describe('generateOpaqueToken / hashToken', () => {
  test('generates distinct tokens on each call', () => {
    expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
  });

  test('hashToken is deterministic for the same input and differs for different input', () => {
    const raw = generateOpaqueToken();
    expect(hashToken(raw)).toBe(hashToken(raw));
    expect(hashToken(raw)).not.toBe(hashToken(generateOpaqueToken()));
  });
});
