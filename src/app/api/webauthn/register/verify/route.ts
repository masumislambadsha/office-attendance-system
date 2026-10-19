import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { currentSession } from "@/auth";
import { collections } from "@/lib/mongo";
import { writeAudit } from "@/actions/audit";
import { rpConfig } from "@/lib/webauthn";
import { challengeFromClientData } from "@/attend/biometric";
import { deviceFor, employeeFor } from "@/lib/webauthn-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Step 2 of enrolment: check the attestation the phone signed and store the
 * public key against this employee's *approved device*.
 */
export async function POST(request: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "sign-in required", code: "not_authed" }, { status: 401 });
  if (!session.user.role) {
    return NextResponse.json({ error: "no active employee record for this email", code: "no_employee" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    device_token?: string;
    response?: { id?: string; clientDataJSON?: string };
  };
  const deviceToken = (body.device_token ?? "").trim();
  const response = body.response;
  if (!deviceToken || !response?.clientDataJSON || !response?.id) {
    return NextResponse.json({ error: "device_token and response required", code: "bad_request" }, { status: 400 });
  }

  const employee = await employeeFor(session.user.email);
  if (!employee) return NextResponse.json({ error: "employee not found", code: "no_employee" }, { status: 404 });

  const device = await deviceFor(employee, deviceToken);
  if (!device || device.status !== "approved") {
    return NextResponse.json({ error: "device not approved by admin", code: "device_pending" }, { status: 403 });
  }

  // The challenge is looked up by the value the browser signed over — the
  // client cannot choose which challenge it is answering.
  const challenge = challengeFromClientData(response.clientDataJSON);
  if (!challenge) {
    return NextResponse.json({ error: "malformed response", code: "bad_request" }, { status: 400 });
  }
  const pending = await collections().webauthnChallenges.findOneAndDelete({
    _id: challenge,
    employee_id: employee._id,
    device_token: deviceToken,
    kind: "registration",
  });
  if (!pending) {
    return NextResponse.json({ error: "challenge expired or already used", code: "challenge_invalid" }, { status: 400 });
  }

  const { rpID, origins } = rpConfig();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: response as never,
      expectedChallenge: challenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "verification failed";
    return NextResponse.json({ error: msg, code: "biometric_failed" }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "fingerprint could not be verified", code: "biometric_failed" }, { status: 400 });
  }

  const info = verification.registrationInfo;
  if (!info.userVerified) {
    return NextResponse.json(
      { error: "the device did not verify the user — enrol again and use the phone's fingerprint/face unlock", code: "biometric_failed" },
      { status: 400 },
    );
  }

  const credentialId = info.credential.id;
  const publicKey = isoBase64URL.fromBuffer(info.credential.publicKey);
  const now = new Date();

  await collections().webauthnCredentials.updateOne(
    { credential_id: credentialId },
    {
      $set: {
        employee_id: employee._id,
        device_token: deviceToken,
        public_key: publicKey,
        counter: info.credential.counter ?? 0,
        transports: (info.credential.transports ?? []) as string[],
        device_type: info.credentialDeviceType ?? null,
        last_used_at: null,
      },
      $setOnInsert: { _id: new ObjectId(), credential_id: credentialId, created_at: now },
    },
    { upsert: true },
  );

  await writeAudit({
    actor: session.user.email,
    action: "webauthn.register",
    entity: `webauthn_credentials:${credentialId}`,
    old: null,
    new: {
      employee: employee.email,
      device_token: deviceToken.slice(0, 12),
      device_type: info.credentialDeviceType,
    },
    reason: "fingerprint enrolled on an approved device",
  });

  return NextResponse.json({ ok: true, credential_id: credentialId, device_type: info.credentialDeviceType ?? null });
}
