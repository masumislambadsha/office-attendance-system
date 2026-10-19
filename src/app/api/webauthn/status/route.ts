import { NextResponse } from "next/server";
import { currentSession } from "@/auth";
import { BIOMETRIC_POLICY } from "@/lib/constants";
import { resolveBiometricPolicy } from "@/attend/biometric";
import { credentialsFor, deviceFor, employeeFor } from "@/lib/webauthn-server";

export const dynamic = "force-dynamic";

/**
 * What the scan page needs to know before it shows anything: is the biometric
 * factor switched on for this deployment, is this device approved, and has
 * this device got a fingerprint enrolled?
 */
export async function GET(request: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "sign-in required", code: "not_authed" }, { status: 401 });
  if (!session.user.role) {
    return NextResponse.json({ error: "no active employee record for this email", code: "no_employee" }, { status: 403 });
  }

  const deviceToken = new URL(request.url).searchParams.get("device_token") ?? "";
  const employee = await employeeFor(session.user.email);
  if (!employee) return NextResponse.json({ error: "employee not found", code: "no_employee" }, { status: 404 });

  const device = await deviceFor(employee, deviceToken);
  const credentials = device && device.status === "approved" ? await credentialsFor(employee, deviceToken) : [];
  const enrolled = credentials.length > 0;
  const decision = resolveBiometricPolicy(BIOMETRIC_POLICY, !!employee.biometric_exempt, enrolled);

  return NextResponse.json({
    policy: BIOMETRIC_POLICY,
    device_status: device?.status ?? "missing",
    enrolled,
    credential_count: credentials.length,
    exempt: !!employee.biometric_exempt,
    required: decision.required,
    allowed: decision.allowed,
  });
}
