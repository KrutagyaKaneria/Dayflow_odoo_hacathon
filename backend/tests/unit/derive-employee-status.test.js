/**
 * modules/integration/deriveEmployeeStatus — Phase 09, Part A. deriveStatusIcon is pure (no
 * DB); this covers the D-40 precedence rule's four (hasCheckIn × hasApprovedLeave) combinations.
 * The fifth dimension the phase spec names — pending leave — is filtered out one layer up, at
 * batchDeriveStatusIcons's query (status: 'approved' only), so a pending leave never even
 * reaches this function as hasApprovedLeave: true — see 15-integration.test.js for the
 * integration-level proof that a PENDING-only leave produces 'absent', never 'on_leave'.
 */
const { deriveStatusIcon } = require('../../src/modules/integration/deriveEmployeeStatus');

describe('deriveStatusIcon — D-40 precedence', () => {
  test('check-in present, approved leave also present -> PRESENT wins (observed fact outranks intention)', () => {
    expect(deriveStatusIcon({ hasCheckIn: true, hasApprovedLeave: true })).toBe('present');
  });

  test('check-in present, no approved leave -> PRESENT', () => {
    expect(deriveStatusIcon({ hasCheckIn: true, hasApprovedLeave: false })).toBe('present');
  });

  test('no check-in, approved leave present -> ON_LEAVE', () => {
    expect(deriveStatusIcon({ hasCheckIn: false, hasApprovedLeave: true })).toBe('on_leave');
  });

  test('no check-in, no approved leave -> ABSENT', () => {
    expect(deriveStatusIcon({ hasCheckIn: false, hasApprovedLeave: false })).toBe('absent');
  });
});
