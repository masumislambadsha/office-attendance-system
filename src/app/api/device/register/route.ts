import { NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/mongo";
import { currentSession } from "@/auth";
import { writeAudit } from "@/actions/audit";

export const dynamic = "force-dynamic";

/**
 * Device binding: mints a persistent per-install device token (SHA-256 of the
 * install id + a server pepper). First appearance is 'pending'; an admin must
 * approve it before it can check in. A token for a revoked device is re-created
 * as pending, which surfaces the change to admins (PRD §11: reset/clear storage).
 */
export async function POST(request: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "sign-in required" }, { status: 401 });
  const user = session.user;
  if (!user.role) return NextResponse.json({ error: "no employee record for this email" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { deviceId?: string };
  const deviceId = body.deviceId?.trim();
  if (!deviceId || deviceId.length < 8 || deviceId.length > 256) {
    return NextResponse.json({ error: "deviceId required" }, { status: 400 });
  }

  const pepper = process.env.BETTER_AUTH_SECRET ?? "dev";
  const deviceToken = createHash("sha256").update(`${deviceId}:${pepper}`).digest("hex");

  const employee = await collections().employees.findOne({ email: user.email.toLowerCase(), active: true });
  if (!employee) return NextResponse.json({ error: "employee not found" }, { status: 404 });

  const existing = await collections().devices.findOne({
    employee_id: employee._id,
    device_token: deviceToken,
  });

  const now = new Date();
  if (!existing) {
    await collections().devices.insertOne({
      _id: new ObjectId(randomUUID().replace(/-/g, "").slice(0, 24)),
      employee_id: employee._id,
      device_token: deviceToken,
      status: "pending",
      created_at: now,
      approved_at: null,
    });
    await writeAudit({
      actor: user.email,
      action: "device.register",
      entity: `devices:${deviceToken}`,
      old: null,
      new: { status: "pending" },
      reason: "first login on this device",
    });
    return NextResponse.json({ device_token: deviceToken, status: "pending", message: "Device registered — ask an admin to approve it." });
  }

  if (existing.status === "revoked") {
    await collections().devices.updateOne(
      { _id: existing._id },
      { $set: { status: "pending", approved_at: null, created_at: now } },
    );
    return NextResponse.json({ device_token: deviceToken, status: "pending", message: "Device re-registered after reset — set to pending." });
  }

  return NextResponse.json({ device_token: deviceToken, status: existing.status });
}