"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/mongo";
import { requireAdmin } from "@/auth";
import { writeAudit } from "@/actions/audit";
import { monthOf } from "@/lib/time";
import { DAY_STATUSES, DayStatus } from "@/attend/types";
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
    const prev = { name: existing.name, email: existing.email, shift_id: existing.shift_id, active: existing.active };
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

export async function addHoliday(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const date = String(formData.get("date") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) return fail("/admin/holidays", "date and name required");
  await collections().holidays.updateOne({ _id: date }, { $set: { name } }, { upsert: true });
  await writeAudit({ actor: actor.email, action: "holiday.create", entity: `holidays:${date}`, old: null, new: { name } });
  revalidatePath("/admin/holidays");
}

export async function removeHoliday(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const date = String(formData.get("date") ?? "");
  const existing = await collections().holidays.findOne({ _id: date });
  if (!existing) return fail("/admin/holidays", "holiday not found");
  await collections().holidays.deleteOne({ _id: date });
  await writeAudit({ actor: actor.email, action: "holiday.delete", entity: `holidays:${date}`, old: { name: existing.name }, new: null });
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

export async function manualCorrect(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const employeeId = String(formData.get("employee_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const status = String(formData.get("status") ?? "") as DayStatus;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!ObjectId.isValid(employeeId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("/admin/sheet", "bad input");
  if (!DAY_STATUSES.includes(status)) return fail("/admin/sheet", "bad status");
  if (!reason) return fail("/admin/sheet", "a reason is mandatory for corrections");

  const month = monthOf(date);
  const { isMonthClosed } = await import("@/attend/payroll");
  if (await isMonthClosed(month)) {
    return fail("/admin/sheet", `month ${month} is closed — reopen it before correcting`);
  }

  const employee = await collections().employees.findOne({ _id: new ObjectId(employeeId) });
  if (!employee) return fail("/admin/sheet", "employee not found");

  const existing = await collections().dailyStatus.findOne({
    employee_id: employee._id,
    date,
  });

  // A manual "leave" keeps the paid/unpaid classification of the covering request.
  let leaveTypeId: string | null = null;
  if (status === "leave") {
    const covering = await collections().leaveRequests
      .find({ employee_id: employee._id, status: "approved", from: { $lte: date }, to: { $gte: date } })
      .toArray();
    const leave = covering.find((r) => !r.half_day) ?? covering[0] ?? null;
    leaveTypeId = leave?.type_id ?? null;
  }

  const set = {
    status,
    late_min: 0,
    flag: null,
    leave_type_id: leaveTypeId,
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
    reason,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/sheet");
}

/** Drops a manual override and restores the computed auto row for that day. */
export async function clearManualOverride(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const employeeId = String(formData.get("employee_id") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!ObjectId.isValid(employeeId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("/admin/sheet", "bad input");

  const month = monthOf(date);
  const { isMonthClosed } = await import("@/attend/payroll");
  if (await isMonthClosed(month)) {
    return fail("/admin/sheet", `month ${month} is closed — reopen it before clearing`);
  }

  const employee = await collections().employees.findOne({ _id: new ObjectId(employeeId) });
  if (!employee) return fail("/admin/sheet", "employee not found");

  const existing = await collections().dailyStatus.findOne({ employee_id: employee._id, date });
  if (!existing || existing.source !== "manual") return fail("/admin/sheet", "no manual override on that day");

  await collections().dailyStatus.deleteOne({ _id: existing._id, source: "manual" });
  const computed = await computeDay(employee, date);
  await materializeDay(computed);

  await writeAudit({
    actor: actor.email,
    action: "daily_status.clear_override",
    entity: `daily_status:${employeeId}:${date}`,
    old: { status: existing.status, source: "manual" },
    new: { status: computed.output.status, source: "auto" },
    reason: "manual override cleared",
  });

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