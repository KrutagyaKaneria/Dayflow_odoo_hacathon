/**
 * Phase 09, Part C — payable-days calculation.
 *
 * [RECOMMENDATION pending D-38 — NEW] The payable-days formula is INVENTED here. Neither the
 * PDF nor the design specifies it beyond "unpaid leave or missing attendance days should reduce
 * payable days". Everything below is a reasoned construction, not a discovered requirement, and
 * every line of it is negotiable.
 *
 *   totalWorkingDays = calendar days in period
 *                      - weekends (per working_days_per_week, Phase 08)
 *                      - public holidays (Phase 07)
 *   payableDays      = totalWorkingDays
 *                      - unpaid-leave days falling on working days
 *                      - working days with NO attendance record and NO approved leave
 *
 * Deliberate choices inside that:
 *   - PAID leave and SICK leave do NOT reduce payable days. That is what "paid" means. Only
 *     unpaid_leave subtracts.
 *   - HALF_DAY attendance contributes 0.5. This depends entirely on D-06's unresolved half-day
 *     threshold, so it inherits that uncertainty directly.
 *   - Weekends and holidays are excluded from totalWorkingDays but a WEEKEND WITH APPROVED
 *     UNPAID LEAVE does not double-subtract — it was never counted (this falls out naturally:
 *     classifyWorkingDays below only ever iterates working days).
 *   - working_days_per_week (Phase 08) gives a COUNT, not WHICH days. A count of 5 is mapped to
 *     Mon-Fri as an [INFERENCE]; neither source names specific working days anywhere. Counts
 *     other than 5/6/7 have no confident mapping and return null rather than guess.
 *   - [INFERENCE, this file's own extension] An OBSERVED check-in on a day that also has
 *     approved unpaid leave counts as fully payable, not subtracted — the same "observed fact
 *     outranks intention" principle D-39/D-40 apply to the status icon and the attendance sync
 *     is applied here too, for consistency, though neither source states this explicitly for
 *     payable days specifically.
 *
 * TODO(D-38): this formula must be confirmed by whoever owns payroll before any figure it
 * produces is shown to an employee or used for payment.
 *
 * This calculation is downstream of four UNRESOLVED decisions. A wrong output here is most
 * likely a wrong input from one of these, not a bug in this file:
 *   D-29 (Phase 06) — work-hours vs. extra-hours split; the design's own example is internally
 *                     inconsistent.
 *   D-30 (Phase 07) — leave day-count inclusive vs. exclusive; the design's May 13-14 -> 01.00
 *                     example does NOT reproduce under the inclusive default Phase 07 adopted.
 *   D-35 (Phase 08) — percentage base; the label says "of Wage", every worked figure computes
 *                     off Basic.
 *   D-22 (Phase 08) — salary overwrites with no history, so a mid-period wage change silently
 *                     reprices the whole period and the prior figure is unrecoverable.
 * TODO: resolve all four together before this output is trusted.
 *
 * No monetary amount is computed or returned anywhere in this file. Payable days is a day
 * count; multiplying it by a wage is payslip territory ([PDF §6]), and this phase stops here.
 *
 * Used from TWO places — the payable-days endpoint (payroll/routes.js) and
 * GET /attendance/me's totalWorkingDays (attendance/service.js) — ONE implementation, never
 * duplicated.
 */
const { prisma } = require('../../config/db');

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toDateKey(date) {
  return date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);
}

// [INFERENCE] working_days_per_week is a COUNT; only the three common cases have a confident
// day-of-week mapping. getUTCDay(): 0=Sun..6=Sat.
function workingWeekdaysForCount(count) {
  if (count === 5) return new Set([1, 2, 3, 4, 5]); // Mon-Fri
  if (count === 6) return new Set([1, 2, 3, 4, 5, 6]); // Mon-Sat
  if (count === 7) return new Set([0, 1, 2, 3, 4, 5, 6]); // every day
  return null;
}

function periodRange(period) {
  const [year, month] = period.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1));
  return { start, end };
}

function enumerateCalendarDates(start, end) {
  const dates = [];
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(new Date(d));
  }
  return dates;
}

/**
 * Pure — no DB access. This is the actual formula; computePayableDaysForPeriod below is only a
 * DB-fetching wrapper around it, so the formula is directly unit-testable with constructed
 * fixtures (see tests/unit/payable-days.test.js).
 *
 * @param calendarDates   Date[] — every calendar day in the period.
 * @param workingWeekdays Set<number> — which getUTCDay() values count as a working day.
 * @param holidayDateKeys Set<string> — 'YYYY-MM-DD' public holiday dates.
 * @param attendanceByDate Map<string, {checkInAt, status}> — this employee's attendance rows,
 *                          keyed by 'YYYY-MM-DD'.
 * @param unpaidLeaveDateKeys Set<string> — 'YYYY-MM-DD' dates covered by an APPROVED unpaid_leave
 *                             request (already clipped to the period by the caller).
 */
function classifyPayableDays({ calendarDates, workingWeekdays, holidayDateKeys, attendanceByDate, unpaidLeaveDateKeys }) {
  let weekendCount = 0;
  let holidayCount = 0;
  const workingDateKeys = [];

  for (const d of calendarDates) {
    const key = toDateKey(d);
    if (!workingWeekdays.has(d.getUTCDay())) {
      weekendCount += 1;
      continue;
    }
    if (holidayDateKeys.has(key)) {
      holidayCount += 1;
      continue;
    }
    workingDateKeys.push(key);
  }

  const totalWorkingDays = workingDateKeys.length;

  let unpaidLeaveDays = 0;
  let missingAttendanceDays = 0;
  let halfDays = 0;

  for (const key of workingDateKeys) {
    const record = attendanceByDate.get(key);

    // Observed presence always wins (D-39/D-40's principle, applied here too) — a working day
    // the employee actually checked into is fully payable regardless of any leave approved for
    // it.
    if (record && record.checkInAt) {
      if (record.status === 'half_day') halfDays += 1;
      continue;
    }

    if (unpaidLeaveDateKeys.has(key)) {
      unpaidLeaveDays += 1;
      continue;
    }

    if (!record) {
      missingAttendanceDays += 1;
    }
    // record exists with no check-in and status 'leave' (paid/sick, synced by Part B) -> fully
    // payable, no subtraction.
  }

  const payableDays = round2(totalWorkingDays - unpaidLeaveDays - missingAttendanceDays - halfDays * 0.5);

  return {
    totalWorkingDays,
    payableDays,
    breakdown: { unpaidLeaveDays, missingAttendanceDays, halfDays, weekends: weekendCount, holidays: holidayCount },
  };
}

// DB-fetching wrapper. employeeProfileId: the employee to compute for. period: 'YYYY-MM',
// defaults to the current month.
async function computePayableDaysForPeriod(employeeProfileId, period) {
  const resolvedPeriod = period && /^\d{4}-\d{2}$/.test(period) ? period : new Date().toISOString().slice(0, 7);
  const { start, end } = periodRange(resolvedPeriod);

  const profile = await prisma.employeeProfile.findUnique({
    where: { id: employeeProfileId },
    select: { organizationId: true, salaryStructure: { select: { workingDaysPerWeek: true } } },
  });

  const workingDaysPerWeek = profile?.salaryStructure?.workingDaysPerWeek != null ? Number(profile.salaryStructure.workingDaysPerWeek) : null;
  const workingWeekdays = workingDaysPerWeek != null ? workingWeekdaysForCount(workingDaysPerWeek) : null;

  // Honest null, not a guess — an employee with no salary structure (or an unmapped
  // working-days-per-week count) has no confidently-derivable working-day calendar.
  if (!workingWeekdays) {
    return { period: resolvedPeriod, totalWorkingDays: null, payableDays: null, breakdown: null };
  }

  const calendarDates = enumerateCalendarDates(start, end);

  const [holidays, attendanceRecords, leaveRecords] = await Promise.all([
    prisma.publicHoliday.findMany({
      where: {
        holidayDate: { gte: start, lt: end },
        OR: profile.organizationId ? [{ organizationId: null }, { organizationId: profile.organizationId }] : [{ organizationId: null }],
      },
      select: { holidayDate: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { employeeProfileId, attendanceDate: { gte: start, lt: end } },
      select: { attendanceDate: true, checkInAt: true, status: true },
    }),
    prisma.leaveRequest.findMany({
      where: { employeeProfileId, status: 'approved', leaveType: 'unpaid_leave', startDate: { lt: end }, endDate: { gte: start } },
      select: { startDate: true, endDate: true },
    }),
  ]);

  const holidayDateKeys = new Set(holidays.map((h) => toDateKey(h.holidayDate)));
  const attendanceByDate = new Map(attendanceRecords.map((r) => [toDateKey(r.attendanceDate), r]));

  const unpaidLeaveDateKeys = new Set();
  for (const leave of leaveRecords) {
    const clippedStart = new Date(Math.max(leave.startDate.getTime(), start.getTime()));
    const clippedEnd = new Date(Math.min(leave.endDate.getTime(), end.getTime() - 24 * 60 * 60 * 1000));
    for (let d = new Date(clippedStart); d <= clippedEnd; d.setUTCDate(d.getUTCDate() + 1)) {
      unpaidLeaveDateKeys.add(toDateKey(d));
    }
  }

  const result = classifyPayableDays({ calendarDates, workingWeekdays, holidayDateKeys, attendanceByDate, unpaidLeaveDateKeys });
  return { period: resolvedPeriod, ...result };
}

module.exports = { computePayableDaysForPeriod, classifyPayableDays, workingWeekdaysForCount, toDateKey };
