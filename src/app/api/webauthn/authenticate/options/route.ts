import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { currentSession } from "@/auth";
import { collections } from "@/lib/mongo";
import { verifyQrToken } from "@/lib/qr";
import { checkGeofence } from "@/lib/geo";
import { QR_MODE } from "@/lib/constants";
import { rpConfig } from "@/lib/webauthn";
import { credentialsFor, deviceFor, employeeFor } from "@/lib/webauthn-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Step 1 of the biometric check: everything the *system* can decide is decided
 * here — the QR is live, the device is approved, the phone is at the office.
 * Only then does the phone ask for a fingerprint.
 *
 * Doing it in this order means the employee is told "you are outside the
 * office" before being asked to touch a sensor, and the fingerprint is never
 * spent on a check-in that was going to be rejected anyway.
 */
export async function POST(request: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "sign-in required", code: "not_authed" }, { status: 401 });
  if (!session.user.role) {
    return NextResponse.json({ error: "no active employee record for this email", code: "no_employee" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    device_token?: string;
    lat?: number;
    lng?: number;
    accuracy?: number;
  };
  const { token, device_token } = body;
  if (!token || !device_token) {
    return NextResponse.json({ error: "token and device_token required", code: "bad_request" }, { status: 400 });
  }

  const employee = await employeeFor(session.user.email);
  if (!employee) return NextResponse.json({ error: "employee not found", code: "no_employee" }, { status: 404 });

  // 1. The QR must be live (dynamic) or the current signed site code (static).
  let payload;
  try {
    payload = await verifyQrToken(token);
  } catch {
    return NextResponse.json({ error: "this QR code is no longer valid — scan again", code: "qr_expired" }, { status: 401 });
  }

  // 2. The device must be approved for this employee.
  const device = await deviceFor(employee, device_token);
  if (!device) {
    return NextResponse.json({ error: "device not registered", code: "device_unregistered" }, { status: 403 });
  }
  if (device.status !== "approved") {
    return NextResponse.json({ error: "device not approved by admin", code: "device_pending" }, { status: 403 });
  }

  // 3. The phone must be at the office. A static QR carries no presence proof
  //    of its own, so there the geofence is the one that has to hold.
  const geo = checkGeofence(
    { lat: body.lat, lng: body.lng, accuracy: body.accuracy },
    { required: QR_MODE === "static" },
  );
  if (!geo.ok) {
    return NextResponse.json(
      { error: geo.message, code: geo.code, distance_m: geo.distanceM },
      { status: 403 },
    );
  }

  // 4. There must be a fingerprint enrolled on this very device.
  const credentials = await credentialsFor(employee, device_token);
  if (credentials.length === 0) {
    return NextResponse.json(
      { error: "no fingerprint enrolled on this device — set one up first", code: "biometric_not_enrolled" },
      { status: 403 },
    );
  }

  const { rpID } = rpConfig();
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map((c) => ({
      id: c.credential_id,
      ...(c.transports.length ? { transports: c.transports as never[] } : {}),
    })),
    userVerification: "required",
    timeout: 120_000,
  });

  // The challenge is bound to this device and to this QR token, so a captured
  // assertion cannot be replayed against a later scan.
  await collections().webauthnChallenges.insertOne({
    _id: options.challenge,
    employee_id: employee._id,
    device_token: device_token,
    kind: "authentication",
    qr_jti: payload.jti,
    createdAt: new Date(),
  });

  return NextResponse.json({ options, mode: payload.mode, distance_m: geo.distanceM });
}
