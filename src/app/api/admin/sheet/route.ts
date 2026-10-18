import { NextResponse } from "next/server";
import { currentSession } from "@/auth";
import { monthlySheet, rowsToCsv, rowsToJsonv1 } from "@/attend/payroll";
import { currentMonthKey } from "@/lib/time";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "sign-in required" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ?? currentMonthKey();
  const format = searchParams.get("format") ?? "csv";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "bad month" }, { status: 400 });
  }
  const sheet = await monthlySheet(month);
  if (format === "json") {
    return new NextResponse(rowsToJsonv1(sheet), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="attendance-${month}.json"`,
      },
    });
  }
  return new NextResponse(rowsToCsv(sheet), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendance-${month}.csv"`,
    },
  });
}
