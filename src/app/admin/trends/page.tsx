import { collections } from "@/lib/mongo";
import { monthLabel } from "@/attend/leave";
import { currentMonthKey, daysInMonth } from "@/lib/time";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Clock, UserX, Coffee, TrendingUp } from "lucide-react";
import { cn } from "cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trends" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** yyyy-MM shifted by n months, without pulling in a date library. */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface MonthCount {
  late: number;
  absent: number;
  half: number;
  lateMin: number;
}

const empty = (): MonthCount => ({ late: 0, absent: 0, half: 0, lateMin: 0 });

export default async function AdminTrendsPage({ searchParams }: Props) {
  const query = await searchParams;
  const endMonth =
    typeof query?.month === "string" && /^\d{4}-\d{2}$/.test(query.month)
      ? query.month
      : currentMonthKey();
  const months = [shiftMonth(endMonth, -2), shiftMonth(endMonth, -1), endMonth];
  const from = `${months[0]}-01`;
  const to = `${endMonth}-${String(daysInMonth(endMonth)).padStart(2, "0")}`;

  const [employees, rows] = await Promise.all([
    collections().employees.find({ active: true }).sort({ name: 1 }).toArray(),
    collections().dailyStatus.find({ date: { $gte: from, $lte: to } }).toArray(),
  ]);

  // employee id -> month -> counts
  const byEmployee = new Map<string, Map<string, MonthCount>>();
  for (const row of rows) {
    const id = row.employee_id.toString();
    const month = row.date.slice(0, 7);
    if (!months.includes(month)) continue;
    if (!byEmployee.has(id)) byEmployee.set(id, new Map());
    const perMonth = byEmployee.get(id)!;
    if (!perMonth.has(month)) perMonth.set(month, empty());
    const counts = perMonth.get(month)!;
    if (row.status === "late") counts.late += 1;
    if (row.status === "absent") counts.absent += 1;
    if (row.status === "half_day") counts.half += 1;
    counts.lateMin += row.late_min ?? 0;
  }

  const lines = employees.map((emp) => {
    const perMonth = byEmployee.get(emp._id.toString()) ?? new Map<string, MonthCount>();
    const totals = empty();
    for (const month of months) {
      const c = perMonth.get(month) ?? empty();
      totals.late += c.late;
      totals.absent += c.absent;
      totals.half += c.half;
      totals.lateMin += c.lateMin;
    }
    return { emp, perMonth, totals };
  });

  lines.sort(
    (a, b) =>
      b.totals.absent - a.totals.absent ||
      b.totals.late - a.totals.late ||
      b.totals.lateMin - a.totals.lateMin ||
      a.emp.name.localeCompare(b.emp.name),
  );

  const sum = lines.reduce(
    (acc, line) => {
      acc.late += line.totals.late;
      acc.absent += line.totals.absent;
      acc.half += line.totals.half;
      acc.lateMin += line.totals.lateMin;
      return acc;
    },
    empty(),
  );

  const stats = [
    { icon: Clock, label: "Late days", value: sum.late, tint: "text-amber-700 bg-amber-50" },
    { icon: UserX, label: "Absent days", value: sum.absent, tint: "text-red-700 bg-red-50" },
    { icon: Coffee, label: "Half days", value: sum.half, tint: "text-orange-700 bg-orange-50" },
    {
      icon: TrendingUp,
      label: "Late minutes",
      value: sum.lateMin,
      tint: "text-sage-700 bg-sage-50",
    },
  ];

  return (
    <div className="space-y-5 sm:space-y-8">
      <div className="relative overflow-hidden rounded-[2rem] bg-[#1a1a1a] p-8 text-warm-50 sm:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#ffffff_1px,transparent_0)] bg-[size:22px_22px] opacity-[0.07]" />
        <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-sage-600/20 blur-3xl" />
        <p className="relative mb-3 text-xs font-semibold tracking-[0.25em] text-sage-400 uppercase">
          Roll-up · {monthLabel(months[0])} – {monthLabel(months[2])}
        </p>
        <h1 className="relative font-serif text-3xl font-bold tracking-tight sm:text-4xl">
          Attendance trends
        </h1>
        <p className="relative mt-3 max-w-xl text-sm text-warm-300 sm:text-base">
          Late and absent days per employee over the last three months. Counts come from the
          materialized daily status, so a day only appears once it has been computed.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="trends-month">Ending month</Label>
          <input
            id="trends-month"
            name="month"
            type="month"
            defaultValue={endMonth}
            className="form-input"
          />
        </div>
        <SubmitButton variant="secondary">Show</SubmitButton>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-2xl border border-warm-100 bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-warm-900/5 sm:p-6"
            >
              <div className={cn("mb-4 flex h-10 w-10 items-center justify-center rounded-xl", stat.tint)}>
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mb-0.5 text-xl font-bold text-[#1a1a1a] sm:text-2xl">{stat.value}</h3>
              <p className="text-xs text-warm-600">{stat.label.toLowerCase()} in range</p>
            </div>
          );
        })}
      </div>

      <Card className="rounded-[2rem] p-2 sm:p-4">
        {lines.length === 0 ? (
          <p className="p-6 text-sm text-warm-600">No active employees yet.</p>
        ) : (
          <Table maxHeight="max-h-[70vh]">
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                {months.map((month) => (
                  <TableHead key={month} className="text-center">
                    {monthLabel(month).replace(/ \d{4}$/, "")} late / abs
                  </TableHead>
                ))}
                <TableHead className="text-center">3-mo late</TableHead>
                <TableHead className="text-center">3-mo absent</TableHead>
                <TableHead className="text-right">Late min</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.emp._id.toString()}>
                  <TableCell className="font-semibold text-[#1a1a1a]">{line.emp.name}</TableCell>
                  {months.map((month) => {
                    const c = line.perMonth.get(month) ?? empty();
                    return (
                      <TableCell key={month} className="text-center tabular-nums text-warm-700">
                        <span className={c.late > 0 ? "font-semibold text-amber-700" : ""}>{c.late}</span>
                        <span className="px-1 text-warm-300">/</span>
                        <span className={c.absent > 0 ? "font-semibold text-red-700" : ""}>
                          {c.absent}
                        </span>
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center font-semibold tabular-nums text-amber-700">
                    {line.totals.late}
                  </TableCell>
                  <TableCell className="text-center font-semibold tabular-nums text-red-700">
                    {line.totals.absent}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-warm-600">
                    {line.totals.lateMin > 0 ? line.totals.lateMin : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <p className="text-xs text-warm-500">
        Sorted by absent days, then late days. Half-days ({sum.half} in range) are counted in the
        summary but not in the per-employee columns.
      </p>
    </div>
  );
}
