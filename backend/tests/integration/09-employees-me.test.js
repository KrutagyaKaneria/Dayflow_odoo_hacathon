/**
 * GET/PATCH /employees/me and POST /employees/me/avatar. Phase 04.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createApp } = require('../../src/app');
const { prisma } = require('../../src/config/db');
const { truncateAuthTables } = require('./support/authTestHelpers');
const { createEmployeeWithProfile } = require('./support/employeeTestHelpers');
const { decryptField } = require('../../src/shared/security/fieldEncryption');

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

describe('GET /employees/me', () => {
  test('returns the full own profile including Bank Details, unmasked', async () => {
    const { user, password } = await createEmployeeWithProfile({
      bankDetails: { accountNumber: '000111222', bankName: 'Test Bank', panNo: 'ABCDE1234F' },
    });
    const accessToken = await signIn(user.email, password);

    const res = await request(app).get('/employees/me').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.profile.userId).toBe(user.id);
    expect(res.body.profile.bankDetails).toEqual({
      accountNumber: '000111222',
      bankName: 'Test Bank',
      ifscCode: null,
      panNo: 'ABCDE1234F',
      uanNo: null,
      empCode: null,
    });
  });

  test('no token -> 401', async () => {
    const res = await request(app).get('/employees/me');
    expect(res.status).toBe(401);
  });

  test('404s when the account has no employee_profile (e.g. a Path B signup account)', async () => {
    const { hashPassword } = require('../../src/modules/auth/password');
    const passwordHash = await hashPassword('Passw0rd!');
    const user = await prisma.user.create({
      data: { email: `no-profile-${Date.now()}@example.com`, role: 'employee', passwordHash, emailVerifiedAt: new Date() },
    });
    const accessToken = await signIn(user.email, 'Passw0rd!');

    const res = await request(app).get('/employees/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROFILE_NOT_FOUND');
  });
});

describe('PATCH /employees/me — field-level edit policy (D-21)', () => {
  test('an allowed field (phone) updates', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const res = await request(app)
      .patch('/employees/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ phone: '+1-555-0100' });

    expect(res.status).toBe(200);
    expect(res.body.profile.phone).toBe('+1-555-0100');
  });

  test('a disallowed field (nationality) is silently ignored: 200, but unchanged in the database', async () => {
    const { user, profile, password } = await createEmployeeWithProfile({
      profileOverrides: { nationality: 'Original' },
    });
    const accessToken = await signIn(user.email, password);

    const res = await request(app)
      .patch('/employees/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nationality: 'Hacked', phone: '+1-555-0101' }); // mixed: one allowed, one not

    expect(res.status).toBe(200);
    expect(res.body.profile.phone).toBe('+1-555-0101'); // the allowed field did apply
    expect(res.body.profile.nationality).toBe('Original'); // the disallowed field did not

    const stored = await prisma.employeeProfile.findUnique({ where: { id: profile.id } });
    expect(stored.nationality).toBe('Original');
  });

  test('a disallowed Bank Details field sent flatly is silently ignored', async () => {
    const { user, profile, password } = await createEmployeeWithProfile({
      bankDetails: { accountNumber: 'ORIGINAL' },
    });
    const accessToken = await signIn(user.email, password);

    const res = await request(app)
      .patch('/employees/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ accountNumber: 'HACKED' });

    expect(res.status).toBe(200);
    const stored = await prisma.employeeBankDetails.findUnique({ where: { employeeProfileId: profile.id } });
    // Phase 10: account_number is encrypted at rest — the raw column is ciphertext, never the
    // literal plaintext, even for a value the endpoint left untouched.
    expect(stored.accountNumber).not.toBe('ORIGINAL');
    expect(decryptField(stored.accountNumber)).toBe('ORIGINAL');
  });

  test('skills must be an array -> 400', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const res = await request(app)
      .patch('/employees/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ skills: 'not-an-array' });

    expect(res.status).toBe(400);
  });

  test('skills as an array updates', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);

    const res = await request(app)
      .patch('/employees/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ skills: ['React', 'Node.js'] });

    expect(res.status).toBe(200);
    expect(res.body.profile.skills).toEqual(['React', 'Node.js']);
  });

  test('no token -> 401', async () => {
    const res = await request(app).patch('/employees/me').send({ phone: '123' });
    expect(res.status).toBe(401);
  });
});

describe('POST /employees/me/avatar', () => {
  function tmpFile(name, buffer) {
    const filePath = path.join(os.tmpdir(), `dayflow-${Date.now()}-${name}`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  test('a valid image sets avatarUrl and persists it', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);
    const filePath = tmpFile('avatar.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])); // full PNG signature (Phase 10 content-sniffing needs the real 8-byte magic, not a truncated prefix)

    const res = await request(app)
      .post('/employees/me/avatar')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('avatar', filePath);

    expect(res.status).toBe(200);
    expect(res.body.profile.avatarUrl).toMatch(/^\/uploads\/avatars\//);

    const stored = await prisma.employeeProfile.findUnique({ where: { userId: user.id } });
    expect(stored.avatarUrl).toBe(res.body.profile.avatarUrl);

    fs.unlinkSync(filePath);
  });

  test('the uploaded avatar is retrievable via the static /uploads route', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);
    const filePath = tmpFile('avatar.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])); // full PNG signature

    const uploadRes = await request(app)
      .post('/employees/me/avatar')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('avatar', filePath);

    const fetchRes = await request(app).get(uploadRes.body.profile.avatarUrl);
    expect(fetchRes.status).toBe(200);

    fs.unlinkSync(filePath);
  });

  test('a non-image file type is rejected with a 4xx error, not a crash', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);
    const filePath = tmpFile('notes.txt', Buffer.from('just some text'));

    const res = await request(app)
      .post('/employees/me/avatar')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('avatar', filePath);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.error).toBeDefined();

    fs.unlinkSync(filePath);
  });

  test('an oversized file is rejected with a 4xx error, not a crash', async () => {
    const { user, password } = await createEmployeeWithProfile();
    const accessToken = await signIn(user.email, password);
    const oversized = Buffer.alloc(3 * 1024 * 1024, 1); // 3MB > the 2MB limit
    const filePath = tmpFile('big.png', oversized);

    const res = await request(app)
      .post('/employees/me/avatar')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('avatar', filePath);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.error).toBeDefined();

    fs.unlinkSync(filePath);
  });

  test('no token -> 401', async () => {
    const filePath = tmpFile('avatar.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])); // full PNG signature
    const res = await request(app).post('/employees/me/avatar').attach('avatar', filePath);
    expect(res.status).toBe(401);
    fs.unlinkSync(filePath);
  });
});
