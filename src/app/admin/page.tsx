import Link from "next/link";
import { collections } from "@/lib/mongo";
import { computeDay, nowDateKey } from "@/attend/service";
import { latestJobRun } from "@/attend/payroll";
import { Row, StatusBadge } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { weekdayOf } from "@/lib/time";
import {
  CheckCircle2,
  Clock,
  Coffee,
  UserX,
  Palmtree,
  Sparkles,
  Moon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin" };

const COUNT_META: Record<string, { icon: LucideIcon; tint: string; label: string }> = {
  present: { icon: CheckCircle2, tint: "text-emerald-700 bg-emerald-50", label: "Present" },
  late: { icon: Clock, tint: "text-amber-700 bg-amber-50", label: "Late" },
  half_day: { icon: Coffee, tint: "text-orange-700 bg-orange-50", label: "Half day" },
  absent: { icon: UserX, tint: "text-red-700 bg-red-50", label: "Absent" },
  leave: { icon: Palmtree, tint: "text-sky-700 bg-sky-50", label: "Leave" },
  holiday: { icon: Sparkles, tint: "text-violet-700 bg-violet-50", label: "Holiday" },
  weekend: { icon: Moon, tint: "text-warm-600 bg-warm-100", label: "Weekend" },
};

export default async function AdminTodayPage() {
  const today = nowDateKey();
  const employees = await collections().employees.find({ active: true }).sort({ name: 1 }).toArray();
  const rows = await Promise.all(
    employees.map(async (emp) => {
      const day = await computeDay(emp, today);
      return { emp, day };
    }),
  );

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.day.output.status] = (counts[r.day.output.status] ?? 0) + 1;

  const job = await latestJobRun();

  const weeks: string[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekday = weekdayOf(today);

  const hm = (d: Date | null | undefined) =>
    d
      ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" })
      : "—";

  return (
    <div className="space-y-5 sm:space-y-8">
      <div className="relative overflow-hidden rounded-[2rem] bg-[#1a1a1a] p-8 text-warm-50 sm:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#ffffff_1px,transparent_0)] bg-[size:22px_22px] opacity-[0.07]" />
        <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-sage-600/20 blur-3xl" />
        <p className="relative mb-3 text-xs font-semibold tracking-[0.25em] text-sage-400 uppercase">
          Today · {today} · {weeks[weekday]}
        </p>
        <h1 className="relative font-serif text-3xl font-bold tracking-tight sm:text-4xl">
          Office attendance
        </h1>
        <p className="relative mt-3 max-w-xl text-sm text-warm-300 sm:text-base">
          {employees.length} active employees ·{" "}
          {job ? `nightly job ${job.status} · ${job.processed ?? 0} rows` : "nightly job never run"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {Object.entries(counts).map(([k, v]) => {
          const meta = COUNT_META[k] ?? COUNT_META.weekend;
          const Icon = meta.icon;
          return (
            <div
              key={k}
              className="rounded-2xl border border-warm-100 bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-warm-900/5 sm:p-6"
            >
              <div className="mb-4 flex items-center justify-between">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl sm:h-11 sm:w-11",
                    meta.tint,
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px] font-semibold sm:text-xs",
                    meta.tint,
                  )}
                >
                  {meta.label}
                </span>
              </div>
              <h3 className="mb-0.5 text-xl font-bold text-[#1a1a1a] sm:text-2xl">{v}</h3>
              <p className="text-xs text-warm-600">{meta.label.toLowerCase()} today</p>
            </div>
          );
        })}
      </div>

      <Card className="rounded-[2rem] p-2 sm:p-4">
        <Table maxHeight="max-h-[70vh]">
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>In</TableHead>
              <TableHead>Out</TableHead>
              <TableHead>Late</TableHead>
              <TableHead>Flag</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.emp._id.toString()}>
                <TableCell className="font-semibold text-[#1a1a1a]">
                  <Link
                    href={`/admin/employees/${r.emp._id.toString()}`}
                    className="font-semibold text-[#1a1a1a] hover:text-sage-700 hover:underline underline-offset-3"
                  >
                    {r.emp.name}
                  </Link>
                </TableCell>
                <TableCell className="text-warm-600">
                  {r.emp.shift_id}
                  {r.emp.weekly_off.includes(weekday) && (
                    <span className="ml-1 text-xs">({weeks[weekday]} off)</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.day.output.status} />
                </TableCell>
                <TableCell className="text-warm-600">{hm(r.day.checkInAt)}</TableCell>
                <TableCell className="text-warm-600">{hm(r.day.checkOutAt)}</TableCell>
                <TableCell className="font-semibold text-[#1a1a1a]">
                  {r.day.lateMin > 0 ? `${r.day.lateMin}m` : "—"}
                </TableCell>
                <TableCell>
                  {r.day.output.flag ? (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      {r.day.output.flag}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">System</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Row
            label="Nightly status job"
            value={
              job ? `${job.status} · ${job.date ?? ""} · ${job.processed ?? 0} rows` : "never run"
            }
          />
          <Row label="Weekday" value={weeks[weekday]} />
        </CardContent>
      </Card>
    </div>
  );
}
