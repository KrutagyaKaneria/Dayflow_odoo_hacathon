/**
 * shared/auth/requireAuth — Phase 03. Pure middleware unit tests, no HTTP server.
 */
const jwt = require('jsonwebtoken');
const { requireAuth } = require('../../src/shared/auth/requireAuth');
const { signAccessToken } = require('../../src/modules/auth/tokens');
const { config } = require('../../src/config/db');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const testUser = { id: 'user-1', role: 'employee', organizationId: 'org-1' };

describe('requireAuth', () => {
  test('populates req.user and calls next() for a valid Bearer token', () => {
    const token = signAccessToken(testUser);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ id: testUser.id, role: testUser.role, organizationId: testUser.organizationId });
    expect(res.status).not.toHaveBeenCalled();
  });

  test('401s when the Authorization header is missing', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: { message: expect.any(String), code: 'UNAUTHORIZED' } });
  });

  test('401s when the header is malformed (no Bearer scheme)', () => {
    const token = signAccessToken(testUser);
    const req = { headers: { authorization: token } }; // missing "Bearer " prefix
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('401s for a garbage/invalid token', () => {
    const req = { headers: { authorization: 'Bearer not-a-real-jwt' } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('401s for an expired token', () => {
    const expiredToken = jwt.sign(
      { sub: testUser.id, role: testUser.role, organizationId: testUser.organizationId },
      config.jwtAccessSecret,
      { expiresIn: -10 } // already expired
    );
    const req = { headers: { authorization: `Bearer ${expiredToken}` } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'Invalid or expired access token.', code: 'UNAUTHORIZED' },
    });
  });

  test('401s for a token signed with a different secret', () => {
    const bogusToken = jwt.sign({ sub: testUser.id, role: testUser.role }, 'wrong-secret');
    const req = { headers: { authorization: `Bearer ${bogusToken}` } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
