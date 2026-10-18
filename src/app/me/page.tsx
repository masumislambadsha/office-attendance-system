import { collections } from "@/lib/mongo";
import { requireEmployee } from "@/auth";
import { computeDays, nowDateKey } from "@/attend/service";
import { getAllLeaveTypes, availableBalance } from "@/attend/leave";
import { daysInMonth, rangeKeys, weekdayOf } from "@/lib/time";
import { Card, CardContent, StatusBadge } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { CalendarDays, Wallet, ArrowRight } from "lucide-react";
import { cn } from "cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "My attendance" };

const GRID_STYLES: Record<string, string> = {
  present: "bg-emerald-50 text-emerald-700",
  late: "bg-amber-50 text-amber-700",
  half_day: "bg-orange-50 text-orange-700",
  absent: "bg-red-50 text-red-700",
  leave: "bg-sky-50 text-sky-700",
  weekend: "bg-warm-100 text-warm-500",
  holiday: "bg-violet-50 text-violet-700",
};

const BALANCE_TINTS = [
  "text-sage-700 bg-sage-50",
  "text-amber-700 bg-amber-50",
  "text-sky-700 bg-sky-50",
  "text-violet-700 bg-violet-50",
];

export default async function MyAttendancePage() {
  const user = await requireEmployee();
  const employee = await collections().employees.findOne({ email: user.email.toLowerCase(), active: true });
  const today = nowDateKey();

  if (!employee) {
    return (
      <Card className="m-6">
        <CardContent className="p-6">
          <p className="text-sm font-medium text-amber-700">
            Logged in as {user.email} but no active employee record exists. Ask an admin to add you.
          </p>
        </CardContent>
      </Card>
    );
  }

  const [day] = await computeDays(employee, [today]);
  const month = today.slice(0, 7);
  const totalDays = daysInMonth(month);
  const keys = rangeKeys(`${month}-01`, `${month}-${String(totalDays).padStart(2, "0")}`);

  const cellDays = (await computeDays(employee, keys)).map((d) => ({ key: d.date, status: d.output.status }));

  const year = Number(month.slice(0, 4));
  const types = await getAllLeaveTypes();
  const balances = await Promise.all(
    types.map(async (t) => ({ type: t, balance: await availableBalance(employee._id, t._id, year) })),
  );

  const myRequests = await collections()
    .leaveRequests.find({ employee_id: employee._id })
    .sort({ created_at: -1 })
    .toArray();

  const weeks = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const firstDow = weekdayOf(`${month}-01`);
  const blanks = Array.from({ length: firstDow });
  const cells: Array<{ key: string; status: string } | null> = [
    ...blanks.map(() => null),
    ...cellDays.map((c) => ({ key: c.key, status: c.status })),
  ];

  const timeLine = [
    today,
    day.checkInAt &&
      `in ${day.checkInAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" })}`,
    day.checkOutAt &&
      `out ${day.checkOutAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" })}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5 sm:space-y-8">
      <div className="relative overflow-hidden rounded-[2rem] bg-[#1a1a1a] p-8 text-warm-50 sm:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#ffffff_1px,transparent_0)] bg-[size:22px_22px] opacity-[0.07]" />
        <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-sage-600/20 blur-3xl" />
        <p className="relative mb-3 text-xs font-semibold tracking-[0.25em] text-sage-400 uppercase">
          Welcome back
        </p>
        <div className="relative flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">
            {employee.name}
          </h1>
          <StatusBadge status={day.output.status} />
          {day.output.flag && (
            <span className="inline-flex items-center rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-semibold text-amber-200">
              {day.output.flag}
            </span>
          )}
        </div>
        <p className="relative mt-3 max-w-xl text-sm text-warm-300 sm:text-base">{timeLine}</p>
        {day.lateMin > 0 && (
          <p className="relative mt-1 text-xs font-medium text-amber-300">
            Late by {day.lateMin} minutes
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {balances.map(({ type, balance }, i) => (
          <div
            key={type._id}
            className="rounded-2xl border border-warm-100 bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-warm-900/5 sm:p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl sm:h-11 sm:w-11",
                  BALANCE_TINTS[i % BALANCE_TINTS.length],
                )}
              >
                {type.paid ? <CalendarDays className="h-5 w-5" /> : <Wallet className="h-5 w-5" />}
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[10px] font-semibold sm:text-xs",
                  BALANCE_TINTS[i % BALANCE_TINTS.length],
                )}
              >
                {type.paid ? "Paid" : "Unpaid"}
              </span>
            </div>
            <h3 className="mb-0.5 text-xl font-bold text-[#1a1a1a] sm:text-2xl">
              {balance.toFixed(balance % 1 === 0 ? 0 : 1)}
            </h3>
            <p className="text-xs text-warm-600">{type.name} left</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-[2rem] border border-warm-100 bg-white p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-serif text-lg font-bold text-[#1a1a1a] sm:text-xl">
                This month · {month}
              </h2>
              <a
                href="/scan"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-sage-600 transition-colors hover:text-sage-700"
              >
                Open scanner
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {weeks.map((w) => (
                <div key={w} className="text-xs font-medium text-warm-500">
                  {w}
                </div>
              ))}
              {cells.map((c, i) =>
                c ? (
                  <div
                    key={c.key}
                    title={c.key}
                    className={cn(
                      "rounded-lg p-2 text-xs font-semibold",
                      GRID_STYLES[c.status] ?? "bg-warm-100 text-warm-500",
                    )}
                  >
                    {Number(c.key.slice(8))}
                  </div>
                ) : (
                  <div key={`blank-${i}`} />
                ),
              )}
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-warm-100 bg-white p-6 sm:p-8">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-serif text-lg font-bold text-[#1a1a1a] sm:text-xl">
              My requests
            </h2>
            <a
              href="/me/leave"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-sage-600 transition-colors hover:text-sage-700"
            >
              Request leave
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <div className="space-y-3">
            {myRequests.slice(0, 8).map((r) => (
              <div
                key={r._id.toString()}
                className="rounded-2xl border border-warm-100 p-4 transition-all duration-200 hover:border-sage-200 hover:bg-sage-50/40"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-[#1a1a1a]">
                    {r.from} → {r.to} {r.half_day ? "(½)" : ""}
                  </p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                      r.status === "approved"
                        ? "bg-emerald-50 text-emerald-700"
                        : r.status === "pending"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-warm-100 text-warm-600",
                    )}
                  >
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
            {myRequests.length === 0 && (
              <p className="text-sm text-warm-600">No requests yet.</p>
            )}
          </div>
          <div className="mt-6 flex gap-2">
            <a href="/me/leave" className={buttonVariants({ size: "sm" })}>
              Request leave
            </a>
            <a href="/me/history" className={buttonVariants({ size: "sm", variant: "secondary" })}>
              Full history
            </a>
            <a href="/scan" className={buttonVariants({ size: "sm", variant: "secondary" })}>
              Open scanner
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
