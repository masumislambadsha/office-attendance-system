import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/mongo";
import { currentSession } from "@/auth";
import { verifyQrToken } from "@/lib/qr";
import { CHECKIN_RATE_LIMIT, DUPLICATE_SCAN_WINDOW_MIN, OFFICE_CONFIGURED, OFFICE_LAT, OFFICE_LNG, OFFICE_RADIUS_M } from "@/lib/constants";
import { computeDay, getEffectiveShift, getWorkingDayScans, materializeDay, nowDateKey } from "@/attend/service";
import { isOvernightShift } from "@/attend/status";
import { hhmmToMinutes, workingDateForScan } from "@/lib/time";

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

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

    // 2b. Location — QR proves presence at the kiosk, GPS proves the phone is at the office.
    let distanceM: number | null = null;
    if (OFFICE_CONFIGURED) {
      if (!hasLocation) {
        return NextResponse.json(
          { error: "location unavailable — enable location access and retry", code: "location_missing" },
          { status: 403 },
        );
      }
      distanceM = haversineMeters(lat, lng, OFFICE_LAT, OFFICE_LNG);
      if (distanceM > OFFICE_RADIUS_M) {
        return NextResponse.json(
          { error: "scan outside office area", code: "outside_geofence", distance_m: Math.round(distanceM) },
          { status: 403 },
        );
      }
    } else if (hasLocation) {
      distanceM = null;
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

    // 4. Single-use token — insert jti first; a replay hits the unique index.
    try {
      await collections().usedTokens.insertOne({ _id: new ObjectId(), jti: payload.jti, createdAt: now });
    } catch (e) {
      if (isDuplicateKey(e)) {
        return NextResponse.json({ error: "token already used", code: "token_replayed" }, { status: 409 });
      }
      throw e;
    }

    // 5. Duplicate-window protection: ignore scans within the window of the last one.
    const lastScan = await collections().checkIns
      .find({ employee_id: employee._id })
      .sort({ ts: -1 })
      .limit(1)
      .toArray();
    if (lastScan[0] && now.getTime() - lastScan[0].ts.getTime() < DUPLICATE_SCAN_WINDOW_MIN * 60_000) {
      return NextResponse.json({ error: "duplicate scan ignored", code: "duplicate", ignored: true }, { status: 202 });
    }

    // 6. First scan of the working-day = check-in; any later scan = (overrides) check-out.
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
      token_jti: payload.jti,
      meta: hasLocation
        ? {
            location: {
              lat,
              lng,
              ...(accuracy != null && Number.isFinite(accuracy) ? { accuracy } : {}),
              ...(distanceM != null ? { distance_m: Math.round(distanceM) } : {}),
              at: now.toISOString(),
            },
          }
        : {},
      device_token,
    });

    // 7. Refresh the live daily_status for the affected working-day.
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