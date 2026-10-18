import { ObjectId } from "mongodb";
import { collections } from "@/lib/mongo";
import { rangeKeys, monthOf, weekdayOf } from "@/lib/time";
import { writeAudit } from "@/actions/audit";
import type { Employee, LeaveBalance, LeaveRequest } from "@/attend/types";

export interface LeaveResult {
  ok: boolean;
  error?: string;
}

function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

export async function getLeaveType(typeId: string) {
  return collections().leaveTypes.findOne({ _id: typeId });
}

export async function getAllLeaveTypes() {
  return collections().leaveTypes.find({}).toArray();
}

async function ensureBalance(employeeId: ObjectId, typeId: string, year: number): Promise<LeaveBalance> {
  const existing = await collections().leaveBalances.findOne({ employee_id: employeeId, type_id: typeId, year });
  if (existing) return existing as LeaveBalance;
  const type = await getLeaveType(typeId);
  await collections().leaveBalances
    .insertOne({
      _id: new ObjectId(),
      employee_id: employeeId,
      type_id: typeId,
      year,
      quota: type?.annual_quota ?? 0,
      used: 0,
      accrual_progress: 0,
    })
    .catch(() => undefined); // concurrent insert
  return (await collections().leaveBalances.findOne({ employee_id: employeeId, type_id: typeId, year })) as LeaveBalance;
}

/** Days in [from,to] that are actual workdays for the employee (not weekly-off, not holiday). */
export async function countWorkdaysInRange(emp: Pick<Employee, "_id" | "weekly_off">, from: string, to: string): Promise<number> {
  const holidays = new Set(
    (await collections().holidays.find({ _id: { $in: rangeKeys(from, to) } }).project({ _id: 1 }).toArray()).map(
      (h) => String(h._id),
    ),
  );
  return rangeKeys(from, to).filter((d) => !emp.weekly_off.includes(weekdayOf(d)) && !holidays.has(d)).length;
}

export async function requestedDaysFor(req: {
  employee: Pick<Employee, "_id" | "weekly_off">;
  typeId: string;
  from: string;
  to: string;
  halfDay: boolean;
}): Promise<{ days: number; error?: string }> {
  if (req.from > req.to) return { days: 0, error: "start date is after end date" };
  if (req.halfDay && req.from !== req.to) return { days: 0, error: "half-day leave applies to a single date" };
  const workdays = await countWorkdaysInRange(req.employee, req.from, req.to);
  if (workdays === 0 && req.from !== req.to) return { days: 0, error: "no working days in that range" };
  return { days: req.halfDay ? 0.5 : workdays };
}

/**
 * Remaining days in the period. Read-only by design: GET renders must never
 * write, so a missing row just means nothing has been used yet; rows are
 * created on approval (and by accrual).
 */
export async function availableBalance(employeeId: ObjectId, typeId: string, year: number): Promise<number> {
  const balance = await collections().leaveBalances.findOne({ employee_id: employeeId, type_id: typeId, year });
  if (balance) return balance.quota - balance.used;
  const type = await getLeaveType(typeId);
  return type?.annual_quota ?? 0;
}

export async function submitLeave(params: {
  employeeId: ObjectId;
  typeId: string;
  from: string;
  to: string;
  halfDay: boolean;
  reason: string;
}): Promise<LeaveResult & { id?: string }> {
  const employee = await collections().employees.findOne({ _id: params.employeeId });
  if (!employee) return { ok: false, error: "employee not found" };
  if (yearOf(params.from) !== yearOf(params.to)) {
    return { ok: false, error: "leave requests cannot span calendar years" };
  }
  const { days, error } = await requestedDaysFor({ ...params, employee });
  if (error) return { ok: false, error };

  const overlapping = await collections().leaveRequests.findOne({
    employee_id: params.employeeId,
    status: { $in: ["pending", "approved"] },
    from: { $lte: params.to },
    to: { $gte: params.from },
  });
  if (overlapping) {
    return { ok: false, error: "overlaps an existing pending or approved request" };
  }

  const type = await getLeaveType(params.typeId);
  const year = yearOf(params.from);

  // Non-earned types must fit inside quota at request time; earned types are
  // only checked against what has accrued by the time an admin approves.
  if (!type?.earned_accrual) {
    const available = await availableBalance(params.employeeId, params.typeId, year);
    if (available < days) {
      return { ok: false, error: `insufficient balance (${available} remaining, ${days} requested)` };
    }
  }

  const inserted = await collections().leaveRequests.insertOne({
    _id: new ObjectId(),
    employee_id: params.employeeId,
    type_id: params.typeId,
    from: params.from,
    to: params.to,
    half_day: params.halfDay,
    reason: params.reason,
    status: "pending",
    requested_days: days,
    created_at: new Date(),
  });
  return { ok: true, id: inserted.insertedId.toString() };
}

/** First month in [from,to] that has been payroll-closed, if any. */
async function firstClosedMonthIn(from: string, to: string): Promise<string | null> {
  const months = new Set(rangeKeys(from, to).map(monthOf));
  for (const month of months) {
    if ((await collections().payrollCloses.countDocuments({ _id: month })) > 0) return month;
  }
  return null;
}

export async function setLeaveStatus(
  requestId: ObjectId,
  toStatus: LeaveRequest["status"],
  actor: string,
): Promise<LeaveResult> {
  const current = await collections().leaveRequests.findOne({ _id: requestId });
  if (!current) return { ok: false, error: "request not found" };
  if (current.status === toStatus) return { ok: false, error: "already in that state" };
  if (current.status === "rejected") return { ok: false, error: "rejected requests cannot change" };

  // Decisions that move leave days in or out of a closed month would silently
  // change an already-payrolled month.
  if (toStatus === "approved" || current.status === "approved") {
    const closed = await firstClosedMonthIn(current.from, current.to);
    if (closed) return { ok: false, error: `payroll for ${closed} is closed — reopen the month first` };
  }

  if (toStatus === "approved") {
    if (current.status !== "pending") return { ok: false, error: "only pending requests can be approved" };
    const balance = await ensureBalance(current.employee_id, current.type_id, yearOf(current.from));
    if (current.requested_days > balance.quota - balance.used) {
      return { ok: false, error: "insufficient remaining balance to approve" };
    }
    const res = await collections().leaveRequests.updateOne(
      { _id: requestId, status: "pending" },
      { $set: { status: "approved", reviewed_by: actor, reviewed_at: new Date() } },
    );
    if (res.matchedCount === 0) return { ok: false, error: "request was already decided" };
    await collections().leaveBalances.updateOne({ _id: balance._id }, { $inc: { used: current.requested_days } });
  } else {
    const fromStatus = current.status;
    const res = await collections().leaveRequests.updateOne(
      { _id: requestId, status: fromStatus },
      { $set: { status: toStatus, reviewed_by: actor, reviewed_at: new Date() } },
    );
    if (res.matchedCount === 0) return { ok: false, error: "request was already decided" };
    if (toStatus === "cancelled" && fromStatus === "approved" && current.requested_days > 0) {
      await collections().leaveBalances.updateOne(
        { employee_id: current.employee_id, type_id: current.type_id, year: yearOf(current.from) },
        { $inc: { used: -current.requested_days } },
      );
    }
  }

  const type = await getLeaveType(current.type_id);
  await writeAudit({
    actor,
    action: `leave.${toStatus}`,
    entity: `leave_requests:${requestId}`,
    old: { status: current.status, type: current.type_id, from: current.from, to: current.to, days: current.requested_days },
    new: { status: toStatus },
    reason: type ? `${type.name} requested ${current.requested_days} day(s)` : undefined,
  });
  return { ok: true };
}

/**
 * Earned-leave accrual for a month: days with status present/late count 1,
 * half-day counts 0.5; every 18 worked days converts to 1 earned leave day.
 * Recomputes year-to-date from daily_status (idempotent), so re-closing a
 * reopened month neither double-credits nor loses already-earned days. Runs at
 * monthly close.
 */
export async function applyEarnedAccrual(month: string, actor: string): Promise<{ credited: number }> {
  const year = Number(month.slice(0, 4));
  const employees = await collections().employees.find({ active: true }).toArray();
  const earnedType = await getLeaveType("earned");
  const baseQuota = earnedType?.annual_quota ?? 0;
  let credited = 0;
  for (const emp of employees) {
    const stats = await collections().dailyStatus
      .find({ employee_id: emp._id, date: { $regex: `^${year}-` } })
      .toArray();
    let worked = 0;
    for (const s of stats) {
      if (s.status === "present" || s.status === "late") worked += 1;
      else if (s.status === "half_day") worked += 0.5;
    }
    const balance = await ensureBalance(emp._id, "earned", year);
    const quota = baseQuota + Math.floor(worked / 18);
    const progress = worked % 18;
    const gained = quota - balance.quota;
    if (gained === 0 && progress === balance.accrual_progress) continue;
    await collections().leaveBalances.updateOne({ _id: balance._id }, { $set: { quota, accrual_progress: progress } });
    if (gained > 0) credited += gained;
  }
  if (credited > 0) {
    await writeAudit({ actor, action: "leave.accrual", entity: `leave_balances:earned:${year}`, new: { month, earned_days_credited: credited } });
  }
  return { credited };
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}