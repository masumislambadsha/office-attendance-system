import Link from "next/link";
import { collections } from "@/lib/mongo";
import { requireEmployee } from "@/auth";
import { computeDays, nowDateKey } from "@/attend/service";
import { currentMonthKey, daysInMonth, rangeKeys, weekdayOf } from "@/lib/time";
import { Card, CardContent, StatusBadge } from "@/components/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, History, UserCog } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "My history" };

const WEEKS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[(m ?? 1) - 1]} ${y}`;
}

function hhmm(d: Date | null): string {
  return d
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" })
    : "—";
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function MyHistoryPage({ searchParams }: Props) {
  const user = await requireEmployee();
  const employee = await collections().employees.findOne({ email: user.email.toLowerCase(), active: true });
  const today = nowDateKey();
  const currentMonth = currentMonthKey();

  if (!employee) {
    return (
      <Card className="m-6">
        <CardContent className="p-6">
          <p className="text-sm font-medium text-amber-700">No active employee record for {user.email}.</p>
        </CardContent>
      </Card>
    );
  }

  const query = await searchParams;
  const month = typeof query?.month === "string" && /^\d{4}-\d{2}$/.test(query.month) ? query.month : currentMonth;

  const totalDays = daysInMonth(month);
  const keys = rangeKeys(`${month}-01`, `${month}-${String(totalDays).padStart(2, "0")}`);
  const days = await computeDays(employee, keys);

  // Summary counts for the month.
  const counts: Record<string, number> = {};
  for (const d of days) counts[d.output.status] = (counts[d.output.status] ?? 0) + 1;
  const withLateMin = days.filter((d) => d.lateMin > 0 && d.checkOutAt).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-serif text-2xl font-bold tracking-tight text-[#1a1a1a] sm:text-3xl">
          <History className="h-6 w-6 text-sage-600" />
          Attendance history
        </h1>
        <Link href="/me" className={buttonVariants({ size: "sm", variant: "secondary" })}>
          <ArrowLeft className="h-4 w-4" />
          Today
        </Link>
      </div>

      <form method="get" action="/me/history" className="mt-4 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="history-month">Month</Label>
          <input
            id="history-month"
            name="month"
            type="month"
            required
            defaultValue={month}
            max={currentMonth}
            className="form-input"
          />
        </div>
        <Button type="submit" variant="secondary">
          Show
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
          {counts["present"] ?? 0} present
        </span>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
          {counts["late"] ?? 0} late
        </span>
        <span className="rounded-full bg-orange-50 px-2.5 py-1 text-orange-700">
          {counts["half_day"] ?? 0} half-day
        </span>
        <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">
          {counts["absent"] ?? 0} absent
        </span>
        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
          {counts["leave"] ?? 0} leave
        </span>
        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
          {counts["holiday"] ?? 0} holiday
        </span>
        <span className="rounded-full bg-warm-100 px-2.5 py-1 text-warm-600">
          {counts["weekend"] ?? 0} weekend
        </span>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{withLateMin} with late minutes</span>
      </div>

      <Card className="mt-4">
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>In</TableHead>
                  <TableHead>Out</TableHead>
                  <TableHead>Late</TableHead>
                  <TableHead className="text-right">Flag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.map((d) => {
                  const flagMeta: Record<string, string> = {
                    early_exit: "Left early",
                    missing_checkout: "Missing out",
                  };
                  return (
                    <TableRow key={d.date} className={d.date === today ? "bg-sage-50/50" : undefined}>
                      <TableCell className="font-mono text-xs">{d.date}</TableCell>
                      <TableCell>{WEEKS[weekdayOf(d.date)]}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          <StatusBadge status={d.output.status} />
                          {d.output.flag && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              {d.output.flag}
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{hhmm(d.checkInAt)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{hhmm(d.checkOutAt)}</TableCell>
                      <TableCell className="text-xs">
                        {d.lateMin > 0 ? (
                          <span className="font-semibold text-amber-700">{d.lateMin}m</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {d.isManual ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 font-semibold text-violet-700">
                            <UserCog className="h-3 w-3" />
                            corrected
                          </span>
                        ) : d.date > today ? (
                          <span className="text-warm-500">upcoming</span>
                        ) : (
                          <span className="text-muted-foreground">{flagMeta[d.output.flag ?? ""] ?? ""}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="border-t py-2.5 text-xs text-muted-foreground">
            {totalDays} calendar days · times Asia/Dhaka · {monthLabel(month)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
