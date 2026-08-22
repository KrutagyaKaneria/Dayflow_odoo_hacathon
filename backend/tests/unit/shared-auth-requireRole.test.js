/**
 * shared/auth/requireRole — Phase 03. Pure middleware unit tests, no HTTP server.
 */
const { requireRole } = require('../../src/shared/auth/requireRole');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('requireRole', () => {
  test('calls next() when req.user.role is in the allowed list', () => {
    const req = { user: { id: 'u1', role: 'admin_hr' } };
    const res = mockRes();
    const next = jest.fn();

    requireRole('admin_hr')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('supports multiple allowed roles', () => {
    const req = { user: { id: 'u1', role: 'employee' } };
    const res = mockRes();
    const next = jest.fn();

    requireRole('admin_hr', 'employee')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('403s when req.user.role is not in the allowed list', () => {
    const req = { user: { id: 'u1', role: 'employee' } };
    const res = mockRes();
    const next = jest.fn();

    requireRole('admin_hr')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: { message: expect.any(String), code: 'FORBIDDEN' } });
  });

  // Defensive check: requireRole must always run after requireAuth in real routes, but must not
  // crash if that invariant is ever violated — fail closed (403), not throw.
  test('fails safely with 403 (not a crash) when req.user is undefined', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    expect(() => requireRole('admin_hr')(req, res, next)).not.toThrow();
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
