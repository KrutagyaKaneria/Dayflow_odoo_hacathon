/**
 * GET /employees — Phase 05 directory listing endpoint. Deliberately minimal projection,
 * safe to expose to any authenticated user regardless of role (see routes.js D-14 note).
 * Phase 04's GET /employees/:id guard is NOT touched by this phase — re-verified unchanged by
 * the full suite (see 10-employees-id.test.js) still passing alongside this file.
 */
const request = require('supertest');
const { createApp } = require('../../src/app');
const { prisma } = require('../../src/config/db');
const { truncateAuthTables } = require('./support/authTestHelpers');
const { createEmployeeWithProfile } = require('./support/employeeTestHelpers');

const app = createApp();

beforeEach(async () => {
  await truncateAuthTables();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function signIn(email, password) {
  const res = await request(app).post('/auth/signin').send({ identifier: email, password });
  return res.body.accessToken;
}

describe('GET /employees', () => {
  test('an authenticated Employee gets 200 with the minimal projection only', async () => {
    const { user: caller, password } = await createEmployeeWithProfile({
      profileOverrides: { name: 'Alice Wonderland' },
    });
    const accessToken = await signIn(caller.email, password);

    const res = await request(app).get('/employees').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const entry = res.body.employees.find((e) => e.id === caller.id);
    expect(entry).toBeDefined();
    expect(Object.keys(entry).sort()).toEqual(['avatarUrl', 'id', 'name', 'statusIcon'].sort());
    // Phase 09 replaced the Phase 05 'unknown' stub with a real D-40 derivation — a caller with
    // no check-in and no approved leave today is 'absent'. See 15-integration.test.js for the
    // full precedence-matrix coverage (present / on_leave / absent).
    expect(entry.statusIcon).toBe('absent');
  });

  test('an authenticated Admin gets 200 with the SAME minimal projection — not more', async () => {
    const { user: admin, password: adminPassword } = await createEmployeeWithProfile({
      role: 'admin_hr',
      profileOverrides: { name: 'Admin Person' },
    });
    await createEmployeeWithProfile({
      profileOverrides: { name: 'Sensitive Employee', nationality: 'Secretland' },
      bankDetails: { accountNumber: 'SECRET-ACCT-1', panNo: 'SECRETPAN1' },
    });
    const accessToken = await signIn(admin.email, adminPassword);

    const res = await request(app).get('/employees').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('SECRET-ACCT-1');
    expect(serialized).not.toContain('SECRETPAN1');
    expect(serialized).not.toContain('Secretland');
    expect(serialized).not.toContain('bankDetails');
    expect(serialized).not.toContain('nationality');
    for (const entry of res.body.employees) {
      expect(Object.keys(entry).sort()).toEqual(['avatarUrl', 'id', 'name', 'statusIcon'].sort());
    }
  });

  test('no token -> 401', async () => {
    const res = await request(app).get('/employees');
    expect(res.status).toBe(401);
  });

  test('search filters by name, case-insensitive partial match', async () => {
    const { user: caller, password } = await createEmployeeWithProfile({ profileOverrides: { name: 'Searcher' } });
    await createEmployeeWithProfile({ profileOverrides: { name: 'Alice Wonderland' } });
    await createEmployeeWithProfile({ profileOverrides: { name: 'Bob Marley' } });
    const accessToken = await signIn(caller.email, password);

    const res = await request(app).get('/employees?search=ali').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const names = res.body.employees.map((e) => e.name);
    expect(names).toContain('Alice Wonderland');
    expect(names).not.toContain('Bob Marley');
    expect(names).not.toContain('Searcher');
  });

  test('returns an empty array (not an error) when nothing matches', async () => {
    const { user: caller, password } = await createEmployeeWithProfile({ profileOverrides: { name: 'Only Person' } });
    const accessToken = await signIn(caller.email, password);

    const res = await request(app)
      .get('/employees?search=zzzznomatch')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.employees).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  test('pagination returns the documented page size and total count', async () => {
    const { user: caller, password } = await createEmployeeWithProfile({ profileOverrides: { name: 'Page Caller' } });
    // 20 more, for 21 total (documented DEFAULT_PAGE_SIZE = 20).
    for (let i = 0; i < 20; i += 1) {
      await createEmployeeWithProfile({ profileOverrides: { name: `Filler Employee ${String(i).padStart(2, '0')}` } });
    }
    const accessToken = await signIn(caller.email, password);

    const page1 = await request(app).get('/employees?page=1').set('Authorization', `Bearer ${accessToken}`);
    expect(page1.status).toBe(200);
    expect(page1.body.employees).toHaveLength(20);
    expect(page1.body.total).toBe(21);
    expect(page1.body.pageSize).toBe(20);
    expect(page1.body.page).toBe(1);

    const page2 = await request(app).get('/employees?page=2').set('Authorization', `Bearer ${accessToken}`);
    expect(page2.status).toBe(200);
    expect(page2.body.employees).toHaveLength(1);
    expect(page2.body.page).toBe(2);
  });
});
