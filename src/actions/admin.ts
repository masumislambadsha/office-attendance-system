"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/mongo";
import { requireAdmin } from "@/auth";
import { writeAudit } from "@/actions/audit";
import { removeLoginByEmail } from "@/lib/accounts";
import { monthOf, rangeKeys } from "@/lib/time";
import { CORRECTABLE_STATUSES, DayStatus } from "@/attend/types";
import { closeMonth, reopenMonth } from "@/attend/payroll";
import { computeDay, materializeDay } from "@/attend/service";

function fail(path: string, msg: string): never {
  redirect(`${path}?error=${encodeURIComponent(msg)}`);
}

function isDuplicateKey(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: number }).code === 11000;
}

function parseWeeklyOff(values: FormDataEntryValue[]): number[] {
  return [...new Set(values.map((v) => Number(String(v))).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))];
}

export async function saveEmployee(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const payload = {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    shift_id: String(formData.get("shift_id") ?? "").trim(),
    weekly_off: parseWeeklyOff(formData.getAll("weekly_off")),
    joined_at: String(formData.get("joined_at") ?? ""),
    monthly_gross: Number(formData.get("monthly_gross") ?? 0),
    active: formData.get("active") === "on",
    // Opt-out of the fingerprint check-in factor (phone without a sensor).
    biometric_exempt: formData.get("biometric_exempt") === "on",
  };
  if (!payload.name || !payload.email || !payload.shift_id || !/^\d{4}-\d{2}-\d{2}$/.test(payload.joined_at)) {
    return fail("/admin/employees", "name, email, shift and join date are required");
  }
  if (id && !ObjectId.isValid(id)) return fail("/admin/employees", "bad employee id");
  const emailTaken = await collections().employees.findOne({
    email: payload.email,
    ...(id ? { _id: { $ne: new ObjectId(id) } } : {}),
  });
  if (emailTaken) return fail("/admin/employees", "another employee already uses that email");
  const now = new Date();

  if (id) {
    const existing = await collections().employees.findOne({ _id: new ObjectId(id) });
    if (!existing) return fail("/admin/employees", "employee not found");
    const prev = {
      name: existing.name,
      email: existing.email,
      shift_id: existing.shift_id,
      active: existing.active,
      biometric_exempt: existing.biometric_exempt ?? false,
    };
    try {
      await collections().employees.updateOne(
        { _id: new ObjectId(id) },
        { $set: { ...payload, updated_at: now } },
      );
    } catch (e) {
      if (isDuplicateKey(e)) return fail("/admin/employees", "another employee already uses that email");
      throw e;
    }
    await writeAudit({ actor: actor.email, action: "employee.update", entity: `employees:${id}`, old: prev, new: payload });
    revalidatePath("/admin");
    revalidatePath("/admin/employees");
    return;
  }

  let insertedId: ObjectId;
  try {
    const inserted = await collections().employees.insertOne({
      _id: new ObjectId(),
      ...payload,
      created_at: now,
      updated_at: now,
    });
    insertedId = inserted.insertedId;
  } catch (e) {
    if (isDuplicateKey(e)) return fail("/admin/employees", "another employee already uses that email");
    throw e;
  }
  await writeAudit({
    actor: actor.email,
    action: "employee.create",
    entity: `employees:${insertedId.toString()}`,
    old: null,
    new: payload,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/employees");
}

export async function toggleEmployeeActive(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const existing = await collections().employees.findOne({ _id: new ObjectId(id) });
  if (!existing) return fail("/admin/employees", "employee not found");
  const next = !existing.active;
  await collections().employees.updateOne({ _id: existing._id }, { $set: { active: next, updated_at: new Date() } });
  await writeAudit({
    actor: actor.email,
    action: "employee.toggle_active",
    entity: `employees:${id}`,
    old: { active: existing.active },
    new: { active: next },
  });
  revalidatePath("/admin/employees");
}

/**
 * Delete a brand-new employee record that has no attendance, leave, or payroll
 * history. Anyone with history must be deactivated instead so the monthly
 * sheets and audit trail stay intact.
 */
export async function deleteEmployee(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!ObjectId.isValid(id)) return fail("/admin/employees", "bad employee id");

  const employee = await collections().employees.findOne({ _id: new ObjectId(id) });
  if (!employee) return fail("/admin/employees", "employee not found");

  const back = `/admin/employees/${id}`;
  if (employee.email.trim().toLowerCase() === actor.email.trim().toLowerCase()) {
    return fail(back, "you cannot delete your own employee record");
  }

  const [statuses, leaves, adjustments] = await Promise.all([
    collections().dailyStatus.countDocuments({ employee_id: employee._id }),
    collections().leaveRequests.countDocuments({ employee_id: employee._id }),
    collections().payrollAdjustments.countDocuments({ employee_id: employee._id }),
  ]);
  if (statuses + leaves + adjustments > 0) {
    return fail(back, "employee has attendance, leave, or payroll history — deactivate instead");
  }

  await removeLoginByEmail(employee.email);
  await Promise.all([
    collections().devices.deleteMany({ employee_id: employee._id }),
    collections().webauthnCredentials.deleteMany({ employee_id: employee._id }),
    collections().webauthnChallenges.deleteMany({ employee_id: employee._id }),
    collections().leaveBalances.deleteMany({ employee_id: employee._id }),
  ]);
  await collections().employees.deleteOne({ _id: employee._id });

  await writeAudit({
    actor: actor.email,
    action: "employee.delete",
    entity: `employees:${id}`,
    old: { name: employee.name, email: employee.email },
    new: null,
  });

  revalidatePath("/admin/employees");
  redirect("/admin/employees");
}

export async function saveShift(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const payload = {
    name: String(formData.get("name") ?? "").trim(),
    start_time: String(formData.get("start_time") ?? ""),
    end_time: String(formData.get("end_time") ?? ""),
    grace_min: Number(formData.get("grace_min") ?? 10),
    half_day_after_min: Number(formData.get("half_day_after_min") ?? 60),
    early_exit_min: Number(formData.get("early_exit_min") ?? 60),
  };
  if (!payload.name || !/^\d{2}:\d{2}$/.test(payload.start_time) || !/^\d{2}:\d{2}$/.test(payload.end_time)) {
    return fail("/admin/shifts", "valid name, start and end time required (HH:MM)");
  }

  if (id) {
    // Edit in place: employees reference the shift by _id, so renaming the
    // display name is safe; there is no way to change the key here.
    const existing = await collections().shifts.findOne({ _id: id });
    if (!existing) return fail("/admin/shifts", "shift not found");
    await collections().shifts.updateOne({ _id: id }, { $set: payload });
    await writeAudit({
      actor: actor.email,
      action: "shift.update",
      entity: `shifts:${id}`,
      old: existing,
      new: { _id: id, ...payload },
    });
    revalidatePath("/admin/shifts");
    return;
  }

  const key = payload.name.toLowerCase().replace(/\s+/g, "_");
  if (await collections().shifts.findOne({ _id: key })) {
    return fail("/admin/shifts", "a shift with that name already exists — edit it instead");
  }
  await collections().shifts.insertOne({ _id: key, ...payload, created_at: new Date() });
  await writeAudit({
    actor: actor.email,
    action: "shift.create",
    entity: `shifts:${key}`,
    old: null,
    new: { _id: key, ...payload },
  });
  revalidatePath("/admin/shifts");
}

const HOLIDAY_MAX_DAYS = 366;

/**
 * Marks every day in [from, to] as a holiday under one name. Single-day adds are
 * just a range where from === to, so one code path serves both.
 */
export async function addHoliday(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "") || from;
  const name = String(formData.get("name") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return fail("/admin/holidays", "valid start and end dates required");
  }
  if (!name) return fail("/admin/holidays", "name required");
  const days = rangeKeys(from, to);
  if (days.length === 0) return fail("/admin/holidays", "end date is before start date");
  if (days.length > HOLIDAY_MAX_DAYS) {
    return fail("/admin/holidays", `range too long — max ${HOLIDAY_MAX_DAYS} days at a time`);
  }
  const now = new Date();
  const ops = days.map((date) => ({
    updateOne: {
      filter: { _id: date },
      update: { $set: { name }, $setOnInsert: { createdAt: now } },
      upsert: true,
    },
  }));
  await collections().holidays.bulkWrite(ops);
  await writeAudit({
    actor: actor.email,
    action: "holiday.create",
    entity: days.length === 1 ? `holidays:${days[0]}` : `holidays:${from}..${to}`,
    old: null,
    new: { name, days: days.length },
  });
  revalidatePath("/admin/holidays");
}

export async function removeHoliday(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "") || from;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return fail("/admin/holidays", "valid start and end dates required");
  }
  const days = rangeKeys(from, to);
  if (days.length === 0) return fail("/admin/holidays", "end date is before start date");
  if (days.length > HOLIDAY_MAX_DAYS) {
    return fail("/admin/holidays", `range too long — max ${HOLIDAY_MAX_DAYS} days at a time`);
  }
  const existing = await collections().holidays.find({ _id: { $in: days } }).toArray();
  if (existing.length === 0) return fail("/admin/holidays", "no holidays in that range");
  await collections().holidays.deleteMany({ _id: { $in: days } });
  await writeAudit({
    actor: actor.email,
    action: "holiday.delete",
    entity: existing.length === 1 ? `holidays:${existing[0]._id}` : `holidays:${from}..${to}`,
    old: { names: [...new Set(existing.map((h) => h.name))], days: existing.length },
    new: null,
  });
  revalidatePath("/admin/holidays");
}

export async function setDeviceStatus(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as "approved" | "revoked";
  const device = await collections().devices.findOne({ _id: new ObjectId(id) });
  if (!device) return fail("/admin/devices", "device not found");
  if (status !== "approved" && status !== "revoked") return fail("/admin/devices", "bad status");
  await collections().devices.updateOne(
    { _id: device._id },
    { $set: { status, approved_at: status === "approved" ? new Date() : device.approved_at } },
  );
  await writeAudit({
    actor: actor.email,
    action: `device.${status}`,
    entity: `devices:${id}`,
    old: { status: device.status },
    new: { status },
  });
  revalidatePath("/admin/devices");
}

const CORRECTION_MAX_DAYS = 366;

/** Shared validation for the two range-based sheet forms. */
function parseRange(formData: FormData): { from: string; to: string; days: string[] } {
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "") || from;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    fail("/admin/sheet", "bad input");
  }
  const days = rangeKeys(from, to);
  if (days.length > CORRECTION_MAX_DAYS) {
    fail("/admin/sheet", `range too long — max ${CORRECTION_MAX_DAYS} days at a time`);
  }
  return { from, to, days };
}

/** A range may not span any month that payroll has locked. */
async function assertMonthsOpen(days: string[]): Promise<void> {
  const { isMonthClosed } = await import("@/attend/payroll");
  for (const month of new Set(days.map(monthOf))) {
    if (await isMonthClosed(month)) {
      fail("/admin/sheet", `month ${month} is closed — reopen it before correcting`);
    }
  }
}

/**
 * Drop the fingerprints enrolled on one device. The employee can enrol again
 * on the same phone; the old public keys stop working immediately.
 */
export async function revokeWebAuthnCredentials(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const deviceId = String(formData.get("device_id") ?? "");
  if (!ObjectId.isValid(deviceId)) return fail("/admin/devices", "bad device");
  const device = await collections().devices.findOne({ _id: new ObjectId(deviceId) });
  if (!device) return fail("/admin/devices", "device not found");

  const removed = await collections().webauthnCredentials.deleteMany({ device_token: device.device_token });
  await writeAudit({
    actor: actor.email,
    action: "webauthn.revoke",
    entity: `devices:${deviceId}`,
    old: { fingerprint_count: removed.deletedCount },
    new: { fingerprint_count: 0 },
    reason: String(formData.get("reason") ?? "fingerprint revoked by admin").trim() || undefined,
  });
  revalidatePath("/admin/devices");
}

/**
 * Permanently remove a device: the device row, its enrolled fingerprints, and
 * any pending WebAuthn challenge. If the same install registers again it comes
 * back as a fresh pending device.
 */
export async function removeDevice(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = String(formData.get("device_id") ?? "");
  const requestedBack = String(formData.get("back") ?? "/admin/devices");
  const back = /^\/admin\/(devices|employees\/[a-f0-9]{24})$/.test(requestedBack)
    ? requestedBack
    : "/admin/devices";

  if (!ObjectId.isValid(id)) return fail(back, "bad device");
  const device = await collections().devices.findOne({ _id: new ObjectId(id) });
  if (!device) return fail(back, "device not found");

  const [credentials] = await Promise.all([
    collections().webauthnCredentials.deleteMany({ device_token: device.device_token }),
    collections().webauthnChallenges.deleteMany({ device_token: device.device_token }),
  ]);
  await collections().devices.deleteOne({ _id: device._id });

  await writeAudit({
    actor: actor.email,
    action: "device.remove",
    entity: `devices:${id}`,
    old: {
      employee_id: device.employee_id.toString(),
      status: device.status,
      fingerprint_count: credentials.deletedCount,
    },
    new: null,
  });

  revalidatePath("/admin/devices");
  revalidatePath(`/admin/employees/${device.employee_id.toString()}`);
  redirect(back);
}

export async function manualCorrect(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const employeeId = String(formData.get("employee_id") ?? "");
  const status = String(formData.get("status") ?? "") as DayStatus;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!ObjectId.isValid(employeeId)) return fail("/admin/sheet", "bad input");
  if (!CORRECTABLE_STATUSES.includes(status)) return fail("/admin/sheet", "bad status");
  if (!reason) return fail("/admin/sheet", "a reason is mandatory for corrections");

  const { from, to, days } = parseRange(formData);
  await assertMonthsOpen(days);

  const employee = await collections().employees.findOne({ _id: new ObjectId(employeeId) });
  if (!employee) return fail("/admin/sheet", "employee not found");

  // A manual "leave" keeps the paid/unpaid classification of the covering request.
  // The covering request can differ per day, so this is resolved inside the loop.
  const leaveFor = async (date: string): Promise<string | null> => {
    if (status !== "leave") return null;
    const covering = await collections().leaveRequests
      .find({ employee_id: employee._id, status: "approved", from: { $lte: date }, to: { $gte: date } })
      .toArray();
    const leave = covering.find((r) => !r.half_day) ?? covering[0] ?? null;
    return leave?.type_id ?? null;
  };

  for (const date of days) {
    const existing = await collections().dailyStatus.findOne({
      employee_id: employee._id,
      date,
    });

    const set = {
      status,
      late_min: 0,
      flag: null,
      leave_type_id: await leaveFor(date),
      source: "manual",
      updated_at: new Date(),
    } as const;
    await collections().dailyStatus.updateOne(
      { employee_id: employee._id, date },
      { $set: set, $setOnInsert: { _id: new ObjectId(), employee_id: employee._id, date } },
      { upsert: true },
    );

    await writeAudit({
      actor: actor.email,
      action: "daily_status.correct",
      entity: `daily_status:${employeeId}:${date}`,
      old: existing ? { status: existing.status, source: existing.source } : null,
      new: { status, source: "manual" },
      reason: days.length > 1 ? `${reason} (applied ${from}..${to})` : reason,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/sheet");
}

/** Drops a manual override and restores the computed auto row for that day. */
export async function clearManualOverride(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const employeeId = String(formData.get("employee_id") ?? "");

  if (!ObjectId.isValid(employeeId)) return fail("/admin/sheet", "bad employee id");

  const { days } = parseRange(formData);
  await assertMonthsOpen(days);

  const employee = await collections().employees.findOne({ _id: new ObjectId(employeeId) });
  if (!employee) return fail("/admin/sheet", "employee not found");

  let cleared = 0;
  for (const date of days) {
    const existing = await collections().dailyStatus.findOne({ employee_id: employee._id, date });
    if (!existing || existing.source !== "manual") continue;

    await collections().dailyStatus.deleteOne({ _id: existing._id, source: "manual" });
    const computed = await computeDay(employee, date);
    await materializeDay(computed);
    cleared++;

    await writeAudit({
      actor: actor.email,
      action: "daily_status.clear_override",
      entity: `daily_status:${employeeId}:${date}`,
      old: { status: existing.status, source: "manual" },
      new: { status: computed.output.status, source: "auto" },
      reason: days.length > 1 ? `manual override cleared across ${days.length} day(s)` : "manual override cleared",
    });
  }

  if (cleared === 0) return fail("/admin/sheet", "no manual override on those day(s)");

  revalidatePath("/admin");
  revalidatePath("/admin/sheet");
}

export async function updateDeductionRule(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const key = String(formData.get("key") ?? "");
  const value = Number(formData.get("value"));
  const label = String(formData.get("label") ?? "");
  if (!key || Number.isNaN(value)) return fail("/admin/close", "bad rule");
  const existing = await collections().deductionRules.findOne({ _id: key });
  await collections().deductionRules.updateOne(
    { _id: key },
    { $set: { value, label: label || existing?.label || key } },
    { upsert: true },
  );
  await writeAudit({
    actor: actor.email,
    action: "deduction_rule.update",
    entity: `deduction_rules:${key}`,
    old: existing ? { value: existing.value } : null,
    new: { value },
  });
  revalidatePath("/admin/close");
}

export async function closeMonthAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const month = String(formData.get("month") ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) return fail("/admin/close", "bad month");
  const res = await closeMonth(month, actor.email);
  if (!res.ok) return fail("/admin/close", res.error ?? "close failed");
  revalidatePath("/admin/close");
  revalidatePath("/admin/sheet");
}

export async function reopenMonthAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const month = String(formData.get("month") ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) return fail("/admin/close", "bad month");
  const res = await reopenMonth(month, actor.email);
  if (!res.ok) return fail("/admin/close", res.error ?? "reopen failed");
  revalidatePath("/admin/close");
  revalidatePath("/admin/sheet");
}