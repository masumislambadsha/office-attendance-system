import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { currentSession } from "@/auth";
import { collections } from "@/lib/mongo";
import { rpConfig } from "@/lib/webauthn";
import { allCredentialsFor, deviceFor, employeeFor } from "@/lib/webauthn-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Step 1 of enrolment: hand the browser a challenge to sign.
 *
 * The credential is bound to the *approved device* it is enrolled on, so a
 * fingerprint can never be used from a phone the employee is not bound to.
 * Only platform authenticators (the phone's own sensor) are accepted, and
 * user verification is required — no PIN-only "biometrics".
 */
export async function POST(request: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "sign-in required", code: "not_authed" }, { status: 401 });
  if (!session.user.role) {
    return NextResponse.json({ error: "no active employee record for this email", code: "no_employee" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { device_token?: string };
  const deviceToken = (body.device_token ?? "").trim();
  if (!deviceToken) {
    return NextResponse.json({ error: "device_token required", code: "bad_request" }, { status: 400 });
  }

  const employee = await employeeFor(session.user.email);
  if (!employee) return NextResponse.json({ error: "employee not found", code: "no_employee" }, { status: 404 });

  const device = await deviceFor(employee, deviceToken);
  if (!device) {
    return NextResponse.json({ error: "device not registered", code: "device_unregistered" }, { status: 403 });
  }
  if (device.status !== "approved") {
    return NextResponse.json({ error: "device not approved by admin", code: "device_pending" }, { status: 403 });
  }

  const existing = await allCredentialsFor(employee);
  const { rpID, rpName, origins } = rpConfig();

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: employee.email,
    userDisplayName: employee.name,
    // The employee record id is the stable user handle.
    userID: new TextEncoder().encode(employee._id.toHexString()),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id,
      ...(c.transports.length ? { transports: c.transports as never[] } : {}),
    })),
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "discouraged",
      userVerification: "required",
    },
    timeout: 120_000,
  });

  // The challenge is the server's own: it is looked up by value when the
  // attestation comes back, and it dies with the TTL index.
  await collections().webauthnChallenges.insertOne({
    _id: options.challenge,
    employee_id: employee._id,
    device_token: deviceToken,
    kind: "registration",
    qr_jti: null,
    createdAt: new Date(),
  });

  return NextResponse.json({ options, rp_id: rpID, origins });
}
