/**
 * modules/integration/payableDays — Phase 09, Part C. classifyPayableDays is pure (no DB); this
 * tests the invented D-38 formula directly against constructed fixtures.
 */
const { classifyPayableDays, workingWeekdaysForCount } = require('../../src/modules/integration/payableDays');

const MON_FRI = new Set([1, 2, 3, 4, 5]);

function date(dayOfMonth) {
  // February 2026: 2nd=Mon, 3rd=Tue, 4th=Wed, 5th=Thu, 6th=Fri, 7th=Sat, 8th=Sun, 9th=Mon.
  return new Date(Date.UTC(2026, 1, dayOfMonth));
}

describe('workingWeekdaysForCount — [INFERENCE] mapping a count to specific weekdays', () => {
  test('5 -> Mon-Fri', () => {
    expect(workingWeekdaysForCount(5)).toEqual(new Set([1, 2, 3, 4, 5]));
  });
  test('6 -> Mon-Sat', () => {
    expect(workingWeekdaysForCount(6)).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });
  test('7 -> every day', () => {
    expect(workingWeekdaysForCount(7)).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
  });
  test('an unmapped count (e.g. 4) returns null rather than guessing which days', () => {
    expect(workingWeekdaysForCount(4)).toBeNull();
  });
});

describe('classifyPayableDays — D-38 formula, every breakdown line asserted individually', () => {
  // Feb 2 (Mon, full attendance) .. Feb 9 (Mon, public holiday). See date() above for the
  // day-of-week mapping. A correct total from two compensating errors is exactly the failure
  // mode this per-line assertion catches — the total alone is not checked first.
  const calendarDates = [date(2), date(3), date(4), date(5), date(6), date(7), date(8), date(9)];

  const attendanceByDate = new Map([
    ['2026-02-02', { checkInAt: new Date('2026-02-02T09:00:00Z'), status: 'present' }], // full attendance
    // 2026-02-03: no record -> missing
    ['2026-02-04', { checkInAt: null, status: 'leave' }], // paid/sick leave, synced by Part B
    // 2026-02-05: no record, but unpaid leave (see unpaidLeaveDateKeys below)
    ['2026-02-06', { checkInAt: new Date('2026-02-06T09:00:00Z'), status: 'half_day' }], // half-day
  ]);
  const unpaidLeaveDateKeys = new Set(['2026-02-05']);
  const holidayDateKeys = new Set(['2026-02-09']); // Monday, would otherwise be a working day

  const result = classifyPayableDays({ calendarDates, workingWeekdays: MON_FRI, holidayDateKeys, attendanceByDate, unpaidLeaveDateKeys });

  test('totalWorkingDays excludes the weekend (Sat+Sun) and the holiday', () => {
    // Working weekdays in the fixture: Feb 2,3,4,5,6 = 5. Feb 7/8 are weekend, Feb 9 is a holiday.
    expect(result.totalWorkingDays).toBe(5);
  });

  test('unpaidLeaveDays counts only the approved-unpaid-leave working day', () => {
    expect(result.breakdown.unpaidLeaveDays).toBe(1);
  });

  test('missingAttendanceDays counts only the day with no record and no leave', () => {
    expect(result.breakdown.missingAttendanceDays).toBe(1);
  });

  test('halfDays counts only the half-day attendance record', () => {
    expect(result.breakdown.halfDays).toBe(1);
  });

  test('weekends counts both Saturday and Sunday', () => {
    expect(result.breakdown.weekends).toBe(2);
  });

  test('holidays counts the one holiday that fell on a would-be working day', () => {
    expect(result.breakdown.holidays).toBe(1);
  });

  test('paid/sick leave (synced LEAVE-status record) does NOT reduce payable days', () => {
    // Feb 4 is a LEAVE-status record but is not unpaid — it must not appear in any subtraction
    // line. Confirmed indirectly: totalWorkingDays(5) - unpaidLeaveDays(1) - missing(1) -
    // halfDays(1)*0.5 = 2.5, which is exactly the payableDays below — if Feb 4 were being
    // subtracted too, this total would be 1.5 instead.
    expect(result.payableDays).toBe(2.5);
  });
});

describe('an observed check-in overrides approved unpaid leave on the same day (this file\'s own D-39/D-40 extension)', () => {
  test('a working day with BOTH a check-in and unpaid leave is fully payable, not subtracted', () => {
    const calendarDates = [date(2)]; // Monday, a working day
    const attendanceByDate = new Map([['2026-02-02', { checkInAt: new Date('2026-02-02T09:00:00Z'), status: 'present' }]]);
    const unpaidLeaveDateKeys = new Set(['2026-02-02']); // also has approved unpaid leave

    const result = classifyPayableDays({
      calendarDates,
      workingWeekdays: MON_FRI,
      holidayDateKeys: new Set(),
      attendanceByDate,
      unpaidLeaveDateKeys,
    });

    expect(result.totalWorkingDays).toBe(1);
    expect(result.breakdown.unpaidLeaveDays).toBe(0);
    expect(result.payableDays).toBe(1);
  });
});

describe('unpaid leave falling on a weekend does not double-subtract', () => {
  test('a Saturday with approved unpaid leave is counted once, as a weekend — never subtracted twice', () => {
    const calendarDates = [date(7)]; // Saturday
    const unpaidLeaveDateKeys = new Set(['2026-02-07']);

    const result = classifyPayableDays({
      calendarDates,
      workingWeekdays: MON_FRI,
      holidayDateKeys: new Set(),
      attendanceByDate: new Map(),
      unpaidLeaveDateKeys,
    });

    expect(result.totalWorkingDays).toBe(0);
    expect(result.breakdown.weekends).toBe(1);
    expect(result.breakdown.unpaidLeaveDays).toBe(0); // never entered the working-day loop at all
    expect(result.payableDays).toBe(0);
  });
});
