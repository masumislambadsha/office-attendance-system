import { ObjectId } from "mongodb";
import { collections } from "@/lib/mongo";
import { addDays, dateKeyInZone, hhmmToMinutes, minutesOfDay, weekdayOf, workingDateForScan, zoneMidnightUtc } from "@/lib/time";
import {
  anchorShiftMinute,
  isOvernightShift,
  resolveDayStatus,
  wrappedEndMin,
  DayOutput,
} from "@/attend/status";
import type { CheckIn, Employee, LeaveRequest, Shift, ShiftOverride } from "@/attend/types";

/** Effective shift timing for an employee on a date, honouring date-ranged overrides (Ramadan, seasonal hours). */
export async function getEffectiveShift(
  employee: Pick<Employee, "shift_id">,
  date: string,
): Promise<{ shift: Shift | null; override: ShiftOverride | null }> {
  const [shift, override] = await Promise.all([
    collections().shifts.findOne({ _id: employee.shift_id }),
    collections()
      .shiftOverrides.find({ shift_id: employee.shift_id, date_from: { $lte: date }, date_to: { $gte: date } })
      .sort({ date_from: 1 })
      .limit(1)
      .toArray()
      .then((rows) => rows[0] ?? null),
  ]);
  if (!shift) return { shift: null, override: null };
  return { shift, override };
}

function shiftTiming(shift: Shift, override: ShiftOverride | null) {
  const startMin = hhmmToMinutes(override ? override.start_time : shift.start_time);
  const endMin = hhmmToMinutes(override ? override.end_time : shift.end_time);
  return {
    startMin,
    endMin,
    overnight: isOvernightShift(startMin, endMin),
    timing: {
      startMin,
      endMin: wrappedEndMin(startMin, endMin),
      graceMin: shift.grace_min,
      halfDayAfterMin: shift.half_day_after_min,
      earlyExitMin: shift.early_exit_min,
    },
  };
}

async function fetchScanWindow(employeeId: ObjectId, fromKey: string, toKey: string): Promise<CheckIn[]> {
  const from = zoneMidnightUtc(addDays(fromKey, -1));
  const to = zoneMidnightUtc(addDays(toKey, 2));
  return collections()
    .checkIns.find({ employee_id: employeeId, ts: { $gte: from, $lt: to } })
    .sort({ ts: 1 })
    .toArray();
}

/**
 * Scans belonging to one working-day for the employee, ascending. A working-day
 * is the Dhaka date whose shift the scans count against — for overnight shifts
 * that spans two calendar days (evening of `date`, morning of `date + 1`).
 */
export async function getWorkingDayScans(
  employeeId: ObjectId,
  date: string,
  startMin: number,
  endMin: number,
  overnight: boolean,
): Promise<CheckIn[]> {
  const scans = await fetchScanWindow(employeeId, date, date);
  return scans.filter((s) => workingDateForScan(startMin, endMin, overnight, s.ts) === date);
}

export interface ComputedDay {
  employeeId: ObjectId;
  date: string;
  output: DayOutput;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  leaveTypeId: string | null;
  leaveHalfDay: boolean;
  lateMin: number;
  isManual: boolean;
  /** Date is after today: the day has not happened yet, so nothing is decided. */
  isFuture: boolean;
}

/** A covering approved request for the date; a full-day request wins over a half-day one. */
function pickLeaveForDate(leaves: LeaveRequest[], date: string): LeaveRequest | null {
  const covering = leaves.filter((r) => r.from <= date && r.to >= date);
  return covering.find((r) => !r.half_day) ?? covering[0] ?? null;
}

/**
 * Single source of truth: computes an employee's status for a set of Dhaka
 * dates. Shift/overrides/holidays/leave/manual rows/scans are preloaded for the
 * whole range once, so a month grid costs a handful of queries instead of O(days).
 */
export async function computeDays(employee: Employee, dates: string[]): Promise<ComputedDay[]> {
  if (dates.length === 0) return [];
  const sorted = [...dates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const today = nowDateKey();

  const [shiftDoc, overrides, holidays, leaves, manualRows, scans] = await Promise.all([
    collections().shifts.findOne({ _id: employee.shift_id }),
    collections()
      .shiftOverrides.find({ shift_id: employee.shift_id, date_from: { $lte: last }, date_to: { $gte: first } })
      .sort({ date_from: 1 })
      .toArray(),
    collections().holidays.find({ _id: { $in: dates } }).project({ _id: 1 }).toArray(),
    collections()
      .leaveRequests.find({ employee_id: employee._id, status: "approved", from: { $lte: last }, to: { $gte: first } })
      .toArray(),
    collections().dailyStatus.find({ employee_id: employee._id, date: { $in: dates }, source: "manual" }).toArray(),
    fetchScanWindow(employee._id, first, last),
  ]);

  const holidaySet = new Set(holidays.map((h) => String(h._id)));
  const manualByDate = new Map(manualRows.map((m) => [m.date, m]));

  return sorted.map((date): ComputedDay => {
    const manual = manualByDate.get(date) ?? null;
    const weekday = weekdayOf(date);

    // Before the employee joined there is nothing to resolve — and nothing to deduct.
    if (employee.joined_at && date < employee.joined_at) {
      return {
        employeeId: employee._id,
        date,
        output: { status: "weekend", lateMin: 0, flag: null },
        checkInAt: null,
        checkOutAt: null,
        leaveTypeId: null,
        leaveHalfDay: false,
        lateMin: 0,
        isManual: !!manual,
        isFuture: false,
      };
    }

    const override = overrides.find((o) => o.date_from <= date && o.date_to >= date) ?? null;
    const timing = shiftDoc ? shiftTiming(shiftDoc, override) : null;
    const leave = pickLeaveForDate(leaves, date);
    const isFuture = date > today;

    const dayScans = timing
      ? scans.filter((s) => workingDateForScan(timing.startMin, timing.endMin, timing.overnight, s.ts) === date)
      : [];
    const firstScan = dayScans[0];
    const lastScan = dayScans.length >= 2 ? dayScans[dayScans.length - 1] : null;
    const anchor = (ts: Date) =>
      anchorShiftMinute(timing!.startMin, timing!.endMin, timing!.overnight, minutesOfDay(ts));

    const output = resolveDayStatus({
      weekday,
      isHoliday: holidaySet.has(date),
      isWeeklyOff: employee.weekly_off.includes(weekday),
      isApprovedLeave: !!leave && !leave.half_day,
      isHalfDayLeave: !!leave && leave.half_day,
      checkInMin: firstScan && timing ? anchor(firstScan.ts) : null,
      checkOutMin: lastScan && timing ? anchor(lastScan.ts) : null,
      shift: timing ? timing.timing : null,
      manualStatus: manual?.status ?? null,
      isFuture,
    });

    return {
      employeeId: employee._id,
      date,
      output,
      checkInAt: firstScan?.ts ?? null,
      checkOutAt: lastScan?.ts ?? null,
      leaveTypeId: leave?.type_id ?? null,
      leaveHalfDay: !!leave?.half_day,
      lateMin: output.lateMin,
      isManual: !!manual,
      isFuture,
    };
  });
}

/** Single-day form of computeDays. */
export async function computeDay(employee: Employee, date: string): Promise<ComputedDay> {
  const [day] = await computeDays(employee, [date]);
  return day;
}

/** Upserts daily_status rows (idempotent on employee+date). Manual rows are never overwritten by the auto job, and days that have not happened yet are never written. */
export async function materializeDays(days: ComputedDay[]): Promise<void> {
  const auto = days.filter((d) => !d.isManual && !d.isFuture);
  if (auto.length === 0) return;
  const now = new Date();
  await collections().dailyStatus.bulkWrite(
    auto.map((d) => ({
      updateOne: {
        filter: { employee_id: d.employeeId, date: d.date },
        update: {
          $set: {
            status: d.output.status,
            late_min: d.lateMin,
            source: "auto",
            leave_type_id: d.leaveTypeId,
            check_in_at: d.checkInAt,
            check_out_at: d.checkOutAt,
            flag: d.output.flag,
            updated_at: now,
          },
          $setOnInsert: { _id: new ObjectId() },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

export async function materializeDay(computed: ComputedDay): Promise<void> {
  await materializeDays([computed]);
}

/** Newest auto-materialized date for one employee (used for per-employee backfill). */
export async function lastMaterializedDateFor(employeeId: ObjectId): Promise<string | null> {
  const rows = await collections().dailyStatus
    .find({ employee_id: employeeId, source: "auto" })
    .sort({ date: -1 })
    .limit(1)
    .toArray();
  return rows[0]?.date ?? null;
}

export function nowDateKey(): string {
  return dateKeyInZone(new Date());
}
