/**
 * modules/attendance/attendancePolicy — Phase 06. Pure functions, no DB.
 */
const {
  APP_TIMEZONE,
  STANDARD_WORK_HOURS,
  HALF_DAY_THRESHOLD_HOURS,
  deriveAttendanceDate,
  computeHours,
  deriveStatus,
} = require('../../src/modules/attendance/attendancePolicy');

describe('documented policy defaults', () => {
  test('APP_TIMEZONE defaults to Asia/Kolkata', () => {
    expect(APP_TIMEZONE).toBe('Asia/Kolkata');
  });

  test('STANDARD_WORK_HOURS is 8', () => {
    expect(STANDARD_WORK_HOURS).toBe(8);
  });

  test('HALF_DAY_THRESHOLD_HOURS is 4', () => {
    expect(HALF_DAY_THRESHOLD_HOURS).toBe(4);
  });
});

describe('computeHours — D-29', () => {
  // Named per the phase spec: the design's own worked example. If this fails, D-29's
  // interpretation is wrong — do not adjust this test to match the code.
  test("design's worked example: check-in 10:00, check-out 19:00 -> workHours 09:00, extraHours 01:00", () => {
    const checkInAt = new Date('2024-01-01T10:00:00.000Z');
    const checkOutAt = new Date('2024-01-01T19:00:00.000Z');
    const { workHours, extraHours } = computeHours(checkInAt, checkOutAt);
    expect(workHours).toBe(9.0);
    expect(extraHours).toBe(1.0);
  });

  test('a session shorter than the standard workday has zero extra hours', () => {
    const checkInAt = new Date('2024-01-01T09:00:00.000Z');
    const checkOutAt = new Date('2024-01-01T12:00:00.000Z');
    const { workHours, extraHours } = computeHours(checkInAt, checkOutAt);
    expect(workHours).toBe(3.0);
    expect(extraHours).toBe(0);
  });

  test('rounds to 2 decimal places', () => {
    const checkInAt = new Date('2024-01-01T09:00:00.000Z');
    const checkOutAt = new Date('2024-01-01T09:20:00.000Z'); // 20 minutes = 0.333...h
    const { workHours } = computeHours(checkInAt, checkOutAt);
    expect(workHours).toBe(0.33);
  });
});

describe('deriveStatus — D-06 half-day threshold boundary', () => {
  test('just below the threshold -> half_day', () => {
    expect(deriveStatus(HALF_DAY_THRESHOLD_HOURS - 0.01)).toBe('half_day');
  });

  test('exactly at the threshold -> present', () => {
    expect(deriveStatus(HALF_DAY_THRESHOLD_HOURS)).toBe('present');
  });

  test('just above the threshold -> present', () => {
    expect(deriveStatus(HALF_DAY_THRESHOLD_HOURS + 0.01)).toBe('present');
  });
});

describe('deriveAttendanceDate — D-26 timezone boundary (Asia/Kolkata, UTC+5:30)', () => {
  test('a UTC instant that falls on the next calendar date in Asia/Kolkata resolves to the local date', () => {
    // 2024-06-14T19:00:00Z -> 2024-06-15T00:30 IST
    expect(deriveAttendanceDate(new Date('2024-06-14T19:00:00.000Z'))).toBe('2024-06-15');
  });

  test('check-in one minute before local midnight stays on the earlier local date', () => {
    // IST midnight is UTC 18:30 the previous day; 18:29Z is 23:59 IST — still the 14th locally.
    expect(deriveAttendanceDate(new Date('2024-06-14T18:29:00.000Z'))).toBe('2024-06-14');
  });

  test('check-in one minute after local midnight rolls to the next local date', () => {
    // 18:31Z is 00:01 IST on the 15th.
    expect(deriveAttendanceDate(new Date('2024-06-14T18:31:00.000Z'))).toBe('2024-06-15');
  });

  test('accepts an ISO string as well as a Date', () => {
    expect(deriveAttendanceDate('2024-06-14T19:00:00.000Z')).toBe('2024-06-15');
  });
});
