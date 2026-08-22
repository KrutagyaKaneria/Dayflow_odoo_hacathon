/**
 * modules/leave/leavePolicy — Phase 07. Pure functions, no DB.
 */
const {
  DAY_COUNT_INCLUSIVE,
  EXCLUDE_HOLIDAYS_FROM_DAY_COUNT,
  EXCLUDE_WEEKENDS_FROM_DAY_COUNT,
  ALLOW_HALF_DAY_LEAVE,
  ENFORCE_BALANCE_HARD_LIMIT,
  REQUIRE_ATTACHMENT_FOR_SICK_LEAVE,
  DEFAULT_ALLOCATIONS,
  countDays,
  rangesOverlap,
  deriveBalance,
  resolveAllocatedDays,
} = require('../../src/modules/leave/leavePolicy');

describe('documented policy defaults', () => {
  test('D-30 defaults: inclusive counting, no weekend/holiday exclusion', () => {
    expect(DAY_COUNT_INCLUSIVE).toBe(true);
    expect(EXCLUDE_HOLIDAYS_FROM_DAY_COUNT).toBe(false);
    expect(EXCLUDE_WEEKENDS_FROM_DAY_COUNT).toBe(false);
  });

  test('half-day leave is not supported', () => {
    expect(ALLOW_HALF_DAY_LEAVE).toBe(false);
  });

  test('D-08: balance is advisory, not hard-enforced', () => {
    expect(ENFORCE_BALANCE_HARD_LIMIT).toBe(false);
  });

  test('sick-leave attachment is not required', () => {
    expect(REQUIRE_ATTACHMENT_FOR_SICK_LEAVE).toBe(false);
  });

  test('default allocations match the design\'s displayed figures', () => {
    expect(DEFAULT_ALLOCATIONS).toEqual({ paid_time_off: 24, sick_leave: 7 });
    expect(DEFAULT_ALLOCATIONS.unpaid_leave).toBeUndefined();
  });
});

describe('countDays — D-30', () => {
  test('same-day request -> 1 day (the case that distinguishes inclusive from exclusive counting)', () => {
    expect(countDays('2025-06-01', '2025-06-01')).toBe(1);
  });

  test('a two-day range -> 2 days', () => {
    expect(countDays('2025-06-01', '2025-06-02')).toBe(2);
  });

  test('a month-spanning range', () => {
    expect(countDays('2025-06-28', '2025-07-02')).toBe(5); // 28,29,30 June + 1,2 July
  });

  test('a year-spanning range', () => {
    expect(countDays('2025-12-30', '2026-01-02')).toBe(4); // Dec 30,31 + Jan 1,2
  });

  // Named per the phase spec: the design's own worked example, annotated with the known,
  // intentional divergence. Do NOT adjust the implementation to force this to 1.00 without a
  // recorded D-30 decision — see leavePolicy.js's D-30 comment for the full reasoning.
  // TODO(D-30): the design shows Validity Period "May 13" to "May 14" with Allocation
  // "01.00 Days". This phase's inclusive default produces 2.00, not 1.00. That divergence is
  // intentional and must be reported, not silently reconciled — see the phase report.
  test("design's worked example: May 13 -> May 14 produces 2.00 under inclusive counting, NOT the mockup's 01.00", () => {
    expect(countDays('2025-05-13', '2025-05-14')).toBe(2.0);
  });
});

describe('rangesOverlap', () => {
  test('identical ranges overlap', () => {
    expect(rangesOverlap('2025-06-01', '2025-06-05', '2025-06-01', '2025-06-05')).toBe(true);
  });

  test('partial front overlap', () => {
    expect(rangesOverlap('2025-06-03', '2025-06-08', '2025-06-01', '2025-06-05')).toBe(true);
  });

  test('partial back overlap', () => {
    expect(rangesOverlap('2025-06-01', '2025-06-05', '2025-06-03', '2025-06-08')).toBe(true);
  });

  test('full containment', () => {
    expect(rangesOverlap('2025-06-10', '2025-06-20', '2025-06-12', '2025-06-15')).toBe(true);
  });

  test('adjacent-but-not-overlapping ranges do NOT trigger', () => {
    expect(rangesOverlap('2025-06-01', '2025-06-05', '2025-06-06', '2025-06-10')).toBe(false);
    expect(rangesOverlap('2025-06-06', '2025-06-10', '2025-06-01', '2025-06-05')).toBe(false);
  });

  test('a range far in the past does not overlap a range far in the future', () => {
    expect(rangesOverlap('2020-01-01', '2020-01-05', '2030-01-01', '2030-01-05')).toBe(false);
  });
});

describe('resolveAllocatedDays', () => {
  test('uses the actual row when one exists', () => {
    expect(resolveAllocatedDays('paid_time_off', { daysAllocated: 15 })).toBe(15);
  });

  test('falls back to DEFAULT_ALLOCATIONS when no row exists for a bounded type', () => {
    expect(resolveAllocatedDays('paid_time_off', null)).toBe(24);
    expect(resolveAllocatedDays('sick_leave', null)).toBe(7);
  });

  test('unpaid_leave has no ceiling even with no row (unbounded by design, not omission)', () => {
    expect(resolveAllocatedDays('unpaid_leave', null)).toBeNull();
  });
});

describe('deriveBalance — D-32 (pending counts against availability)', () => {
  test('mixed pending/approved/rejected requests', () => {
    const requests = [
      { status: 'approved', daysCount: 5 },
      { status: 'approved', daysCount: 3 },
      { status: 'pending', daysCount: 2 },
      { status: 'rejected', daysCount: 100 }, // must not count at all
    ];
    const balance = deriveBalance(24, requests);
    expect(balance).toEqual({ allocated: 24, used: 8, pending: 2, available: 14 });
  });

  test('no requests at all', () => {
    expect(deriveBalance(24, [])).toEqual({ allocated: 24, used: 0, pending: 0, available: 24 });
  });

  test('allocated null (unpaid_leave) yields null allocated/available regardless of usage', () => {
    const requests = [{ status: 'approved', daysCount: 10 }];
    const balance = deriveBalance(null, requests);
    expect(balance.allocated).toBeNull();
    expect(balance.available).toBeNull();
    expect(balance.used).toBe(10);
  });

  test('pending exceeding allocation produces a negative available (advisory, not blocked — D-08)', () => {
    const requests = [{ status: 'pending', daysCount: 30 }];
    const balance = deriveBalance(24, requests);
    expect(balance.available).toBe(-6);
  });
});
