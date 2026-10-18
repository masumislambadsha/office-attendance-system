import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { collections } from "@/lib/mongo";
import { CRON_SECRET } from "@/lib/constants";
import { addDays, rangeKeys } from "@/lib/time";
import { computeDays, lastMaterializedDateFor, materializeDays, nowDateKey } from "@/attend/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BACKFILL_DAYS = 31;

function secretMatches(candidate: string | null): boolean {
  if (!candidate || !CRON_SECRET) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(CRON_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Vercel Cron (schedule 0 18 * * * UTC = 00:00-00:59 Dhaka, see README).
 * Computes the *previous* Dhaka date so the job never races midnight scans.
 *
 * Self-healing per employee: each run back-fills that employee's missing dates
 * since their last materialized row (capped so a cold first run stays bounded,
 * and never before their join date). Idempotent: daily_status upserts keyed
 * (employee_id, date); manual rows are never overwritten.
 */
export async function GET(request: Request) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const queryKey = new URL(request.url).searchParams.get("cron");
  if (!secretMatches(bearer) && !secretMatches(queryKey)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = new Date();
  const job = await collections().jobRuns.insertOne({
    _id: started.getTime().toString() + "." + ((await collections().jobRuns.countDocuments({})) + Math.random()),
    job: "daily-status",
    started_at: started,
    status: "running",
  });

  try {
    const target = addDays(nowDateKey(), -1); // previous Dhaka date
    const floor = addDays(target, -(MAX_BACKFILL_DAYS - 1));
    const employees = await collections().employees.find({ active: true }).toArray();
    let processed = 0;
    let skipped = 0;
    for (const emp of employees) {
      try {
        const last = await lastMaterializedDateFor(emp._id);
        let from = last && last < target ? addDays(last, 1) : !last ? floor : target;
        if (from < floor) from = floor;
        if (emp.joined_at && from < emp.joined_at) from = emp.joined_at;
        if (from > target) {
          skipped++;
          continue;
        }
        const computed = await computeDays(emp, rangeKeys(from, target));
        await materializeDays(computed);
        processed += computed.length;
      } catch {
        skipped++;
      }
    }

    await collections().jobRuns.updateOne(
      { _id: job.insertedId },
      { $set: { status: "ok", finished_at: new Date(), date: target, processed, skipped } },
    );

    return NextResponse.json({
      ok: true,
      target,
      employees: employees.length,
      processed,
      skipped,
      ms: Date.now() - started.getTime(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    await collections().jobRuns.updateOne(
      { _id: job.insertedId },
      { $set: { status: "error", finished_at: new Date(), error: msg } },
    );
    return NextResponse.json({ error: "job failed" }, { status: 500 });
  }
}
