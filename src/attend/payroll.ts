import { collections } from "@/lib/mongo";
import { daysInMonth, rangeKeys, weekdayOf } from "@/lib/time";
import { computeDays } from "@/attend/service";
import { applyEarnedAccrual } from "@/attend/leave";
import { writeAudit } from "@/actions/audit";
import type { DayStatus, PayrollAdjustment } from "@/attend/types";

export interface SheetRow {
  employee_id: string;
  name: string;
  month: string;
  gross: number;
  rate_per_day: number;
  working_days: number;
  present: number;
  late: number;
  half_days: number;
  absents: number;
  leave_paid: number;
  leave_unpaid: number;
  deduction_days: number;
  deduction_amount: number;
}

export const CSV_HEADER =
  "employee_id,name,working_days,present,late,half_days,absents,leave_paid,leave_unpaid,deduction_days,deduction_amount";

export function rowsToCsv(rows: SheetRow[]): string {
  const lines = rows.map((r) =>
    [
      r.employee_id,
      escapeCsv(r.name),
      r.working_days,
      r.present,
      r.late,
      r.half_days,
      r.absents,
      r.leave_paid,
      r.leave_unpaid,
      r.deduction_days,
      r.deduction_amount.toFixed(2),
    ].join(","),
  );
  return [CSV_HEADER, ...lines].join("\n");
}

export function rowsToJsonv1(rows: SheetRow[]): string {
  return JSON.stringify({ version: 1, generated_at: new Date().toISOString(), rows }, null, 2);
}

function escapeCsv(v: string): string {
  // Neutralise spreadsheet formula injection (a name like "=cmd()" must not execute).
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function isMonthClosed(month: string): Promise<boolean> {
  return (await collections().payrollCloses.countDocuments({ _id: month })) > 0;
}

async function getRules(): Promise<Record<string, number>> {
  const rules = await collections().deductionRules.find({}).toArray();
  return Object.fromEntries(rules.map((r) => [r._id, r.value]));
}

async function leavePaidMap(): Promise<{ paid: Set<string>; unpaid: Set<string> }> {
  const types = await collections().leaveTypes.find({}).toArray();
  return {
    paid: new Set(types.filter((t) => t.paid).map((t) => t._id)),
    unpaid: new Set(types.filter((t) => !t.paid).map((t) => t._id)),
  };
}

function accumulate(counts: SheetRow, status: DayStatus, latePaid: boolean, halfDayLeave: boolean): void {
  switch (status) {
    case "present":
      counts.present++;
      break;
    case "late":
      counts.late++;
      break;
    case "half_day":
      counts.half_days++;
      break;
    case "absent":
      counts.absents++;
      break;
    case "leave":
      if (halfDayLeave) {
        if (latePaid) counts.leave_paid += 0.5;
        else counts.leave_unpaid += 0.5;
      } else if (latePaid) counts.leave_paid++;
      else counts.leave_unpaid++;
      break;
    default:
      break; // weekend / holiday are not labour days
  }
}

/** Shape stored in payroll_adjustments (keyed by the update filter's employee_id+month). */
function adjustmentFields(counts: SheetRow): Omit<PayrollAdjustment, "_id" | "employee_id"> {
  return {
    employee_name: counts.name,
    month: counts.month,
    working_days: counts.working_days,
    present: counts.present,
    late: counts.late,
    half_days: counts.half_days,
    absents: counts.absents,
    leave_paid: counts.leave_paid,
    leave_unpaid: counts.leave_unpaid,
    deduction_days: counts.deduction_days,
    deduction_amount: counts.deduction_amount,
    gross: counts.gross,
    rate_per_day: counts.rate_per_day,
  };
}

/**
 * Monthly close: locks the prior month (refuses a double close), recomputes
 * every day from the single source of truth, applies deduction rules, writes
 * per-employee adjustments (upsert keyed employee+month) and credits earned
 * leave. Re-closing after a reopen overwrites the month's adjustments.
 */
export async function closeMonth(month: string, actorEmail: string): Promise<{ ok: boolean; error?: string; rows?: number }> {
  if (await isMonthClosed(month)) {
    return { ok: false, error: "month is already closed — reopen it before changing anything" };
  }

  const [employees, rules, paidTypes] = await Promise.all([
    collections().employees.find({ active: true }).toArray(),
    getRules(),
    leavePaidMap(),
  ]);

  const latesPerAbsent = Math.max(1, rules["lates_per_absent"] ?? 3);
  const divisor = Math.max(1, rules["absent_day_divisor"] ?? 30);
  const halfMul = rules["half_day_multiplier"] ?? 0.5;
  const unpaidMul = rules["unpaid_leave_multiplier"] ?? 1;
  const monthDays = daysInMonth(month);
  const dateList = rangeKeys(`${month}-01`, `${month}-${String(monthDays).padStart(2, "0")}`);

  const holidays = new Set(
    (await collections().holidays.find({ _id: { $regex: `^${month}-` } }).project({ _id: 1 }).toArray()).map((h) =>
      String(h._id),
    ),
  );

  let saved = 0;
  for (const emp of employees) {
    const counts: SheetRow = {
      employee_id: emp._id.toString(),
      name: emp.name,
      month,
      gross: emp.monthly_gross,
      rate_per_day: Number((emp.monthly_gross / divisor).toFixed(2)),
      working_days: 0,
      present: 0,
      late: 0,
      half_days: 0,
      absents: 0,
      leave_paid: 0,
      leave_unpaid: 0,
      deduction_days: 0,
      deduction_amount: 0,
    };

    const days = await computeDays(emp, dateList);
    for (const day of days) {
      if (emp.joined_at && day.date < emp.joined_at) continue;
      const isOff = emp.weekly_off.includes(weekdayOf(day.date)) || holidays.has(day.date);
      if (!isOff) counts.working_days++;
      const leavePaid = day.leaveTypeId ? paidTypes.paid.has(day.leaveTypeId) : false;
      accumulate(counts, day.output.status, leavePaid, day.leaveHalfDay);
    }

    const lateAbsents = Math.floor(counts.late / latesPerAbsent);
    counts.deduction_days =
      Number((counts.absents + counts.half_days * halfMul + counts.leave_unpaid * unpaidMul + lateAbsents).toFixed(2));
    counts.deduction_amount = Number((counts.deduction_days * counts.rate_per_day).toFixed(2));

    await collections().payrollAdjustments.updateOne(
      { employee_id: emp._id, month },
      { $set: adjustmentFields(counts) },
      { upsert: true },
    );
    saved++;
  }

  const accrual = await applyEarnedAccrual(month, actorEmail);
  await collections().payrollCloses.insertOne({
    _id: month,
    month,
    closed_by: actorEmail,
    closed_at: new Date(),
  });
  await writeAudit({
    actor: actorEmail,
    action: "month.close",
    entity: `payroll_closes:${month}`,
    old: null,
    new: { month, adjustments: saved },
    reason: `earned leave credited: ${accrual.credited} day(s)`,
  });

  return { ok: true, rows: saved };
}

export async function reopenMonth(month: string, actorEmail: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isMonthClosed(month))) {
    return { ok: false, error: "month is not closed" };
  }
  await collections().payrollCloses.deleteOne({ _id: month });
  await writeAudit({
    actor: actorEmail,
    action: "month.reopen",
    entity: `payroll_closes:${month}`,
    old: { closed: true },
    new: { closed: false },
    reason: "unlock month for corrections",
  });
  return { ok: true };
}

/** Monthly sheet rows (this is what HR judges the software by). */
export async function monthlySheet(month: string): Promise<SheetRow[]> {
  const adjustments = await collections().payrollAdjustments
    .find({ month })
    .sort({ employee_name: 1 })
    .toArray();
  return adjustments.map((a) => ({
    employee_id: a.employee_id.toString(),
    name: a.employee_name,
    month,
    gross: a.gross,
    rate_per_day: a.rate_per_day,
    working_days: a.working_days,
    present: a.present,
    late: a.late,
    half_days: a.half_days,
    absents: a.absents,
    leave_paid: a.leave_paid,
    leave_unpaid: a.leave_unpaid,
    deduction_days: a.deduction_days,
    deduction_amount: a.deduction_amount,
  }));
}

export async function latestJobRun(job = "daily-status") {
  const docs = await collections().jobRuns.find({ job }).sort({ started_at: -1 }).limit(1).toArray();
  return docs[0] ?? null;
}