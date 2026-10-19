import { ObjectId } from "mongodb";
import { collections } from "@/lib/mongo";
import type { Device, Employee, WebAuthnCredential } from "@/attend/types";

/** The employee behind a signed-in session, or null when there is no active record. */
export async function employeeFor(email: string): Promise<Employee | null> {
  return collections().employees.findOne({ email: email.toLowerCase(), active: true });
}

/** The device record for this install, whatever its approval state. */
export async function deviceFor(employee: Employee, deviceToken: string): Promise<Device | null> {
  if (!deviceToken) return null;
  return collections().devices.findOne({ employee_id: employee._id, device_token: deviceToken });
}

/** Credentials enrolled on this employee's approved device. */
export async function credentialsFor(employee: Employee, deviceToken: string): Promise<WebAuthnCredential[]> {
  if (!deviceToken) return [];
  return collections()
    .webauthnCredentials.find({ employee_id: employee._id, device_token: deviceToken })
    .sort({ created_at: 1 })
    .toArray();
}

/** Every credential an employee has enrolled, on any device. */
export async function allCredentialsFor(employee: Employee): Promise<WebAuthnCredential[]> {
  return collections().webauthnCredentials.find({ employee_id: employee._id }).sort({ created_at: 1 }).toArray();
}

export function objectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}
