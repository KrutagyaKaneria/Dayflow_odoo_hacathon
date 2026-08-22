/**
 * shared/auth/requireSelfOrRole — Phase 03. Pure middleware unit tests, no HTTP server, no
 * real endpoint yet — built ready for Phase 04 (profile/attendance/leave/salary).
 */
const { requireSelfOrRole } = require('../../src/shared/auth/requireSelfOrRole');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('requireSelfOrRole', () => {
  test('allows the owner acting on their own resource', async () => {
    const req = { user: { id: 'user-1', role: 'employee' }, params: { userId: 'user-1' } };
    const res = mockRes();
    const next = jest.fn();
    const getResourceOwnerId = (r) => r.params.userId;

    await requireSelfOrRole(getResourceOwnerId, 'admin_hr')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('403s a non-owner, non-privileged caller acting on someone else\'s resource', async () => {
    const req = { user: { id: 'user-2', role: 'employee' }, params: { userId: 'user-1' } };
    const res = mockRes();
    const next = jest.fn();
    const getResourceOwnerId = (r) => r.params.userId;

    await requireSelfOrRole(getResourceOwnerId, 'admin_hr')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: { message: expect.any(String), code: 'FORBIDDEN' } });
  });

  test('allows a non-owner privileged role acting on someone else\'s resource', async () => {
    const req = { user: { id: 'admin-1', role: 'admin_hr' }, params: { userId: 'user-1' } };
    const res = mockRes();
    const next = jest.fn();
    const getResourceOwnerId = (r) => r.params.userId;

    await requireSelfOrRole(getResourceOwnerId, 'admin_hr')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('supports an async getResourceOwnerId (e.g. a DB lookup)', async () => {
    const req = { user: { id: 'user-1', role: 'employee' } };
    const res = mockRes();
    const next = jest.fn();
    const getResourceOwnerId = async () => 'user-1';

    await requireSelfOrRole(getResourceOwnerId, 'admin_hr')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('passes a getResourceOwnerId rejection to next(err) instead of swallowing it', async () => {
    const req = { user: { id: 'user-1', role: 'employee' } };
    const res = mockRes();
    const next = jest.fn();
    const boom = new Error('lookup failed');
    const getResourceOwnerId = async () => {
      throw boom;
    };

    await requireSelfOrRole(getResourceOwnerId, 'admin_hr')(req, res, next);

    expect(next).toHaveBeenCalledWith(boom);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('fails safely with 403 (not a crash) when req.user is undefined', async () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();
    const getResourceOwnerId = jest.fn();

    await requireSelfOrRole(getResourceOwnerId, 'admin_hr')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(getResourceOwnerId).not.toHaveBeenCalled();
  });
});
