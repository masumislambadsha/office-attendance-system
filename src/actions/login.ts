"use server";

import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuth, requireAdmin, requireEmployee } from "@/auth";
import { collections, getDb } from "@/lib/mongo";
import { generatePassword, hashPassword } from "@/lib/password";
import { writeAudit } from "@/actions/audit";

export interface LoginState {
  ok: boolean;
  message: string;
  email?: string;
  password?: string;
  created?: boolean;
}


/**
 * Create (or reset) the better-auth login for an employee record.
 *
 * The app has sign-up disabled, so this is the only way a new hire gets a
 * password: an admin generates one and hands it over. The password is
 * returned once for display and never written to the audit log.
 */
export async function createEmployeeLogin(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const actor = await requireAdmin();

  const id = String(formData.get("employee_id") ?? "");
  if (!ObjectId.isValid(id)) return { ok: false, message: "Bad employee id." };

  const employee = await collections().employees.findOne({ _id: new ObjectId(id) });
  if (!employee) return { ok: false, message: "Employee not found." };

  const db = getDb();
  const users = db.collection<{ _id: string | ObjectId; [key: string]: unknown }>("user");
  const accounts = db.collection("account");
  const email = employee.email.trim().toLowerCase();
  const now = new Date();

  const existing = await users.findOne({ email });
  const existingCredential = existing
    ? await accounts.findOne({ userId: existing._id, providerId: "credential" })
    : null;
  const password = generatePassword();
  const hash = await hashPassword(password);

  let userId: string | ObjectId;
  if (existing) {
    userId = existing._id;
    await users.updateOne(
      { _id: existing._id },
      { $set: { name: employee.name, updatedAt: now } },
    );
  } else {
    userId = randomBytes(12).toString("hex");
    await users.insertOne({
      _id: userId,
      name: employee.name,
      email,
      emailVerified: true,
      role: "employee",
      createdAt: now,
      updatedAt: now,
    });
  }

  await accounts.updateOne(
    { userId, providerId: "credential" },
    {
      $set: { password: hash, updatedAt: now },
      $setOnInsert: { _id: randomBytes(12).toString("hex"), accountId: userId, createdAt: now },
    },
    { upsert: true },
  );

  await writeAudit({
    actor: actor.email,
    action: existingCredential ? "employee.login.reset" : "employee.login.create",
    entity: `employees:${id}`,
    new: { email },
  });

  revalidatePath(`/admin/employees/${id}`);

  return {
    ok: true,
    message: existingCredential
      ? "Password reset. The previous password no longer works."
      : "Login created. Give the employee the password below.",
    email,
    password,
    created: !existingCredential,
  };
}

export interface PasswordState {
  ok: boolean;
  message: string;
}


/** Self-service password change for a signed-in employee/admin. */
export async function changeOwnPassword(
  _previous: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  await requireEmployee();

  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!currentPassword) return { ok: false, message: "Enter your current password." };
  if (newPassword.length < 10) {
    return { ok: false, message: "The new password must be at least 10 characters." };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, message: "The new passwords do not match." };
  }
  if (newPassword === currentPassword) {
    return { ok: false, message: "Choose a password different from the current one." };
  }

  try {
    await getAuth().api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: false },
      headers: new Headers(await headers()),
    });
  } catch (error) {
    const code = (error as { body?: { code?: string } })?.body?.code;
    if (code === "INVALID_PASSWORD") {
      return { ok: false, message: "Your current password is incorrect." };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not change the password.",
    };
  }

  return { ok: true, message: "Password changed." };
}
