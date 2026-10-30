import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { ObjectId } from "mongodb";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { collections } from "@/lib/mongo";
import { currentSession } from "@/auth";
import { verifyQrToken } from "@/lib/qr";
import { checkGeofence } from "@/lib/geo";
import {
  BIOMETRIC_POLICY,
  CHECKIN_RATE_LIMIT,
  DUPLICATE_SCAN_WINDOW_MIN,
  QR_MODE,
  STATIC_QR_VERSION,
} from "@/lib/constants";
import { computeDay, getEffectiveShift, getWorkingDayScans, materializeDay, nowDateKey } from "@/attend/service";
import { isOvernightShift } from "@/attend/status";
import { hhmmToMinutes, workingDateForScan } from "@/lib/time";
import { rpConfig } from "@/lib/webauthn";
import { challengeFromClientData, clientDataJsonFrom, resolveBiometricPolicy } from "@/attend/biometric";
import { credentialsFor } from "@/lib/webauthn-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function allowRate(key: string): Promise<boolean> {
  const res = await collections().rateLimits.findOneAndUpdate(
    { _id: key },
    { $inc: { count: 1 }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true, returnDocument: "after" },
  );
  return (res?.count ?? CHECKIN_RATE_LIMIT + 1) <= CHECKIN_RATE_LIMIT;
}

function isDuplicateKey(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: number }).code === 11000;
}

export async function POST(request: Request) {
  const session = await currentSession();
  if (!session) {
    return NextResponse.json({ error: "sign-in required", code: "not_authed" }, { status: 401 });
  }
  const user = session.user;
  if (!user.role) {
    return NextResponse.json({ error: "no active employee record for this email", code: "no_employee" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    device_token?: string;
    lat?: number;
    lng?: number;
    accuracy?: number;
    assertion?: {
      id?: string;
      rawId?: string;
      type?: string;
      clientDataJSON?: string;
      response?: { clientDataJSON?: string; authenticatorData?: string; signature?: string; userHandle?: string | null };
    };
  };
  const { token, device_token } = body;
  if (!token || !device_token) {
    return NextResponse.json({ error: "token and device_token required", code: "bad_request" }, { status: 400 });
  }
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const accuracy = body.accuracy != null ? Number(body.accuracy) : undefined;
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);

  // 1. QR signature + expiry (45s) — proves presence at the kiosk.
  //    In static mode this is the signed site code instead.
  let payload;
  try {
    payload = await verifyQrToken(token);
  } catch {
    return NextResponse.json({ error: "invalid or expired token", code: "invalid_token" }, { status: 401 });
  }

  try {
    const employee = await collections().employees.findOne({ email: user.email.toLowerCase(), active: true });
    if (!employee) {
      return NextResponse.json({ error: "employee not found", code: "no_employee" }, { status: 404 });
    }

    // 2. Device binding — scan only counts from this employee's approved device.
    const device = await collections().devices.findOne({
      employee_id: employee._id,
      device_token,
    });
    if (!device) {
      return NextResponse.json({ error: "device not registered", code: "device_unregistered" }, { status: 403 });
    }
    if (device.status !== "approved") {
      return NextResponse.json({ error: "device not approved by admin", code: "device_pending" }, { status: 403 });
    }

    // 2b. Location — QR proves presence at the kiosk, GPS proves the phone is
    //     at the office. A static code carries no presence proof of its own,
    //     so there the geofence is the one that must hold.
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

    // 3. Per-device rate limit, bucketed per 5-minute window (Atlas-backed TTL counter).
    const now = new Date();
    const windowStart = Math.floor(now.getTime() / (5 * 60_000));
    const allowed = await allowRate(
      `ci:${createHash("sha256").update(device_token).digest("hex")}:${windowStart}`,
    );
    if (!allowed) {
      return NextResponse.json({ error: "too many attempts", code: "rate_limited" }, { status: 429 });
    }

    // 4. Biometric factor — the employee's own fingerprint (or face unlock) on
    //    the very device that is bound to them. The assertion is checked
    //    against a challenge issued for this employee, this device and this
    //    QR token, and that challenge dies on use.
    const credentials = await credentialsFor(employee, device_token);
    const decision = resolveBiometricPolicy(
      BIOMETRIC_POLICY,
      !!employee.biometric_exempt,
      credentials.length > 0,
    );

    if (decision.required) {
      const assertion = body.assertion;
      // @simplewebauthn/browser sends the WebAuthn JSON shape: the signed
      // clientDataJSON is under `assertion.response`.
      const clientDataJSON = clientDataJsonFrom(assertion);
      if (
        !clientDataJSON ||
        !assertion?.id ||
        !assertion.response?.authenticatorData ||
        !assertion.response?.signature
      ) {
        return NextResponse.json(
          { error: "fingerprint confirmation required", code: "biometric_required" },
          { status: 403 },
        );
      }

      const challenge = challengeFromClientData(clientDataJSON);
      if (!challenge) {
        return NextResponse.json({ error: "malformed biometric response", code: "biometric_failed" }, { status: 400 });
      }

      const pending = await collections().webauthnChallenges.findOneAndDelete({
        _id: challenge,
        employee_id: employee._id,
        device_token,
        kind: "authentication",
        // A dynamic QR token may only be answered by a challenge issued for it.
        ...(payload.jti ? { qr_jti: payload.jti } : { qr_jti: null }),
      });
      if (!pending) {
        return NextResponse.json(
          { error: "fingerprint challenge expired — scan the QR again", code: "biometric_challenge_expired" },
          { status: 403 },
        );
      }

      const credential = credentials.find((c) => c.credential_id === assertion.id);
      if (!credential) {
        return NextResponse.json(
          { error: "this fingerprint is not enrolled on your device", code: "biometric_failed" },
          { status: 403 },
        );
      }

      const { rpID, origins } = rpConfig();
      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: assertion as never,
          expectedChallenge: challenge,
          expectedOrigin: origins,
          expectedRPID: rpID,
          credential: {
            id: credential.credential_id,
            publicKey: isoBase64URL.toBuffer(credential.public_key),
            counter: credential.counter,
            transports: credential.transports as never[],
          },
          requireUserVerification: true,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "fingerprint check failed";
        return NextResponse.json({ error: msg, code: "biometric_failed" }, { status: 403 });
      }

      if (!verification.verified || !verification.authenticationInfo.userVerified) {
        return NextResponse.json(
          { error: "fingerprint could not be verified", code: "biometric_failed" },
          { status: 403 },
        );
      }

      await collections().webauthnCredentials.updateOne(
        { _id: credential._id },
        {
          $set: {
            counter: verification.authenticationInfo.newCounter,
            last_used_at: now,
            device_type: verification.authenticationInfo.credentialDeviceType,
          },
        },
      );
    }

    // 5. Single-use token — insert jti first; a replay hits the unique index.
    //    A static code has no jti to burn: it is the site code, not a scan.
    if (payload.jti) {
      try {
        await collections().usedTokens.insertOne({ _id: new ObjectId(), jti: payload.jti, createdAt: now });
      } catch (e) {
        if (isDuplicateKey(e)) {
          return NextResponse.json({ error: "token already used", code: "token_replayed" }, { status: 409 });
        }
        throw e;
      }
    }

    // 6. Duplicate-window protection: ignore scans within the window of the last one.
    const lastScan = await collections().checkIns
      .find({ employee_id: employee._id })
      .sort({ ts: -1 })
      .limit(1)
      .toArray();
    if (lastScan[0] && now.getTime() - lastScan[0].ts.getTime() < DUPLICATE_SCAN_WINDOW_MIN * 60_000) {
      return NextResponse.json({ error: "duplicate scan ignored", code: "duplicate", ignored: true }, { status: 202 });
    }

    // 7. First scan of the working-day = check-in; any later scan = (overrides) check-out.
    //    For overnight shifts the working-day is the previous calendar date when the
    //    scan happens before shift start (e.g. a next-morning checkout).
    const today = nowDateKey();
    const eff = await getEffectiveShift({ shift_id: employee.shift_id }, today);
    const startMin = eff.override
      ? hhmmToMinutes(eff.override.start_time)
      : eff.shift
        ? hhmmToMinutes(eff.shift.start_time)
        : 0;
    const endMin = eff.override
      ? hhmmToMinutes(eff.override.end_time)
      : eff.shift
        ? hhmmToMinutes(eff.shift.end_time)
        : 0;
    const overnight = eff.shift ? isOvernightShift(startMin, endMin) : false;
    const workDate = eff.shift ? workingDateForScan(startMin, endMin, overnight, now) : today;
    const workScans = await getWorkingDayScans(employee._id, workDate, startMin, endMin, overnight);
    const kind: "in" | "out" = workScans.length === 0 ? "in" : "out";

    await collections().checkIns.insertOne({
      _id: new ObjectId(),
      employee_id: employee._id,
      ts: now,
      kind,
      token_jti: payload.jti ?? `static:${STATIC_QR_VERSION}`,
      meta: {
        ...(hasLocation
          ? {
              location: {
                lat,
                lng,
                ...(accuracy != null && Number.isFinite(accuracy) ? { accuracy } : {}),
                ...(geo.distanceM != null ? { distance_m: geo.distanceM } : {}),
                at: now.toISOString(),
              },
            }
          : {}),
        ...(body.assertion?.id ? { webauthn: { credential_id: body.assertion.id } } : {}),
        qr_mode: payload.mode,
      },
      device_token,
    });

    // 8. Refresh the live daily_status for the affected working-day.
    const computed = await computeDay(employee, workDate);
    await materializeDay(computed);

    return NextResponse.json({
      ok: true,
      kind,
      date: workDate,
      checkedAt: now.toISOString(),
      status: computed.output.status,
      message: kind === "in" ? "Checked in" : "Checked out",
    });
  } catch (e) {
    console.error("check-in failed", e);
    return NextResponse.json({ error: "internal error", code: "internal" }, { status: 500 });
  }
}
