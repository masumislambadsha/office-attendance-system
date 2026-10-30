import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/mongo";
import { computeDays, nowDateKey } from "@/attend/service";
import { availableBalance, getAllLeaveTypes, monthLabel } from "@/attend/leave";
import { setDeviceStatus, toggleEmployeeActive, deleteEmployee, removeDevice } from "@/actions/admin";
import { removeEmployeeLogin } from "@/actions/login";
import { currentMonthKey, daysInMonth, rangeKeys, weekdayOf } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle, ErrorBanner, Row, StatusBadge } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { SubmitButton } from "@/components/ui/submit-button";
import { CreateLoginCard } from "@/components/create-login-card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, History, UserCog } from "lucide-react";
import { cn } from "cn";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!ObjectId.isValid(id)) return { title: "Employee" };
  const employee = await collections().employees.findOne({ _id: new ObjectId(id) }, { projection: { name: 1 } });
  return { title: employee?.name ?? "Employee" };
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const WEEKS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const COUNT_PILLS: Array<{ key: string; label: string; className: string }> = [
  { key: "present", label: "present", className: "bg-emerald-50 text-emerald-700" },
  { key: "late", label: "late", className: "bg-amber-50 text-amber-700" },
  { key: "half_day", label: "half-day", className: "bg-orange-50 text-orange-700" },
  { key: "absent", label: "absent", className: "bg-red-50 text-red-700" },
  { key: "leave", label: "leave", className: "bg-sky-50 text-sky-700" },
  { key: "holiday", label: "holiday", className: "bg-violet-50 text-violet-700" },
  { key: "weekend", label: "weekend", className: "bg-warm-100 text-warm-600" },
];

const FLAG_META: Record<string, string> = {
  early_exit: "Left early",
  missing_checkout: "Missing out",
};

const DEVICE_STATUS_STYLES: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  revoked: "bg-red-50 text-red-700",
};

const LEAVE_STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  cancelled: "bg-warm-100 text-warm-600",
};

const BALANCE_TINTS = [
  "text-sage-700 bg-sage-50",
  "text-amber-700 bg-amber-50",
  "text-sky-700 bg-sky-50",
  "text-violet-700 bg-violet-50",
];

function hhmm(d: Date | null): string {
  return d ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" }) : "—";
}

function stamp(d: Date): string {
  return d.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" });
}

export default async function EmployeeDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const employeeId = new ObjectId(id);

  const employee = await collections().employees.findOne({ _id: employeeId });
  if (!employee) notFound();

  const query = await searchParams;
  const error = typeof query?.error === "string" ? query.error : null;
  const today = nowDateKey();
  const currentMonth = currentMonthKey();
  const month =
    typeof query?.month === "string" && /^\d{4}-\d{2}$/.test(query.month) ? query.month : currentMonth;
  const year = Number(month.slice(0, 4));
  const totalDays = daysInMonth(month);
  const monthKeys = rangeKeys(`${month}-01`, `${month}-${String(totalDays).padStart(2, "0")}`);

  const [
    days,
    shift,
    leaveTypes,
    requests,
    adjustments,
    closes,
    devices,
    audit,
  ] = await Promise.all([
    computeDays(employee, monthKeys.includes(today) ? monthKeys : [...monthKeys, today]),
    collections().shifts.findOne({ _id: employee.shift_id }),
    getAllLeaveTypes(),
    collections().leaveRequests.find({ employee_id: employeeId }).sort({ created_at: -1 }).toArray(),
    collections().payrollAdjustments.find({ employee_id: employeeId }).sort({ month: -1 }).toArray(),
    collections().payrollCloses.find({}).project({ _id: 1 }).toArray(),
    collections().devices.find({ employee_id: employeeId }).sort({ created_at: 1 }).toArray(),
    collections()
      .auditLog.find({
        $or: [{ entity: `employees:${id}` }, { entity: { $regex: `^daily_status:${id}:` } }],
      })
      .sort({ ts: -1 })
      .limit(20)
      .toArray(),
  ]);

  const loginDb = getDb();
  const loginUser = await loginDb
    .collection("user")
    .findOne({ email: employee.email.trim().toLowerCase() });
  const hasLogin = loginUser
    ? Boolean(
        await loginDb.collection("account").findOne({
          userId: loginUser._id,
          providerId: "credential",
        }),
      )
    : false;

  const balances = await Promise.all(
    leaveTypes.map(async (t) => ({ type: t, balance: await availableBalance(employeeId, t._id, year) })),
  );

  const monthDays = days.filter((d) => d.date.startsWith(month));
  const elapsedDays = monthDays.filter((d) => !d.isFuture);
  const todayDay = days.find((d) => d.date === today) ?? null;
  const typeName = new Map(leaveTypes.map((t) => [t._id, t.name]));
  const closedMonths = new Set(closes.map((c) => String(c._id)));

  // Calendar facts (holiday/weekend/booked leave) are known ahead of time, so
  // they count for the whole month; labour outcomes only count once a day has
  // elapsed — a future day must never read as absent.
  const counts: Record<string, number> = {};
  for (const d of monthDays) {
    if (d.isFuture && !["holiday", "weekend", "leave"].includes(d.output.status)) continue;
    counts[d.output.status] = (counts[d.output.status] ?? 0) + 1;
  }
  const withLateMin = elapsedDays.filter((d) => d.lateMin > 0 && d.checkOutAt).length;
  const upcoming = monthDays.filter((d) => d.output.status === "upcoming").length;
  // Weekly-off days that a manual correction overrode — without this the
  // "weekend" tally reads 0 while the shift was in fact marked present.
  const offDaysOverridden = elapsedDays.filter(
    (d) => d.isManual && employee.weekly_off.includes(weekdayOf(d.date)) && d.output.status !== "weekend",
  );

  const timeline = [
    today,
    todayDay?.checkInAt && `in ${hhmm(todayDay.checkInAt)}`,
    todayDay?.checkOutAt && `out ${hhmm(todayDay.checkOutAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5 sm:space-y-8">
      <ErrorBanner message={error} />
      <div>
        <Link
          href="/admin/employees"
          className={buttonVariants({ size: "sm", variant: "secondary", className: "mb-3" })}
        >
          <ArrowLeft className="h-4 w-4" />
          Employees
        </Link>

        <div className="relative overflow-hidden rounded-[2rem] bg-[#1a1a1a] p-8 text-warm-50 sm:p-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#ffffff_1px,transparent_0)] bg-[size:22px_22px] opacity-[0.07]" />
          <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-sage-600/20 blur-3xl" />
          <p className="relative mb-3 text-xs font-semibold tracking-[0.25em] text-sage-400 uppercase">
            Employee · joined {employee.joined_at}
          </p>
          <div className="relative flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">{employee.name}</h1>
            {employee.active ? (
              <span className="rounded-full bg-emerald-400/20 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                active
              </span>
            ) : (
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-warm-300">
                inactive
              </span>
            )}
            {todayDay && <StatusBadge status={todayDay.output.status} />}
            {todayDay?.output.flag && (
              <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-semibold text-amber-200">
                {todayDay.output.flag}
              </span>
            )}
          </div>
          <p className="relative mt-3 max-w-xl text-sm text-warm-300 sm:text-base">{timeline}</p>
          {todayDay && todayDay.lateMin > 0 && (
            <p className="relative mt-1 text-xs font-medium text-amber-300">
              Late by {todayDay.lateMin} minutes today
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Attendance · {monthLabel(month)}</CardTitle>
            </CardHeader>
            <CardContent>
              <form method="get" className="flex flex-wrap items-end gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="detail-month">Month</Label>
                  <input
                    id="detail-month"
                    name="month"
                    type="month"
                    required
                    defaultValue={month}
                    max={currentMonth}
                    className="form-input"
                  />
                </div>
                <SubmitButton variant="secondary">Show</SubmitButton>
              </form>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
                {COUNT_PILLS.map((p) => (
                  <span key={p.key} className={cn("rounded-full px-2.5 py-1", p.className)}>
                    {counts[p.key] ?? 0} {p.label}
                  </span>
                ))}
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                  {withLateMin} with late minutes
                </span>
                {upcoming > 0 && (
                  <span className="rounded-full bg-warm-100 px-2.5 py-1 text-warm-600">
                    {upcoming} not worked yet
                  </span>
                )}
                {offDaysOverridden.length > 0 && (
                  <span
                    title="Weekly-off days that a manual correction overrode — these are counted as worked days"
                    className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700"
                  >
                    {offDaysOverridden.length} weekly off marked worked
                  </span>
                )}
              </div>

              <Table maxHeight="max-h-[70vh]">
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
                  {monthDays.map((d) => (
                    <TableRow key={d.date} className={d.date === today ? "bg-sage-50/50" : undefined}>
                      <TableCell className="font-mono text-xs">{d.date}</TableCell>
                      <TableCell>{WEEKS[weekdayOf(d.date)]}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          <StatusBadge status={d.output.status} />
                          {!d.isFuture && d.output.flag && (
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
                        ) : d.output.status === "upcoming" ? (
                          <span className="text-warm-500">not worked yet</span>
                        ) : (
                          <span className="text-muted-foreground">
                            {FLAG_META[d.output.flag ?? ""] ?? ""}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="border-t py-2.5 text-xs text-muted-foreground">
                {totalDays} calendar days · times Asia/Dhaka
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Leave requests</CardTitle>
            </CardHeader>
            <CardContent>
              <Table maxHeight="max-h-[70vh]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((r) => (
                    <TableRow key={r._id.toString()}>
                      <TableCell className="font-medium">{typeName.get(r.type_id) ?? r.type_id}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.from} → {r.to}
                        {r.half_day ? " (½)" : ""}
                      </TableCell>
                      <TableCell>{r.requested_days}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                            LEAVE_STATUS_STYLES[r.status],
                          )}
                        >
                          {r.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{stamp(r.created_at)}</TableCell>
                    </TableRow>
                  ))}
                  {requests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                        No leave requests.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payroll history</CardTitle>
            </CardHeader>
            <CardContent>
              <Table maxHeight="max-h-[70vh]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Work</TableHead>
                    <TableHead>P</TableHead>
                    <TableHead>Late</TableHead>
                    <TableHead>½</TableHead>
                    <TableHead>Abs</TableHead>
                    <TableHead>L(p)</TableHead>
                    <TableHead>L(u)</TableHead>
                    <TableHead>Ded days</TableHead>
                    <TableHead className="text-right">Amount (BDT)</TableHead>
                    <TableHead className="text-right">State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustments.map((a) => {
                    const closed = closedMonths.has(a.month);
                    return (
                      <TableRow key={a._id.toString()}>
                        <TableCell className="font-medium">{monthLabel(a.month)}</TableCell>
                        <TableCell>{a.working_days}</TableCell>
                        <TableCell className="font-semibold text-emerald-700">{a.present}</TableCell>
                        <TableCell className="font-semibold text-amber-700">{a.late}</TableCell>
                        <TableCell className="font-semibold text-orange-700">{a.half_days}</TableCell>
                        <TableCell className="font-semibold text-red-700">{a.absents}</TableCell>
                        <TableCell className="font-semibold text-sky-700">{a.leave_paid}</TableCell>
                        <TableCell className="font-semibold text-violet-700">{a.leave_unpaid}</TableCell>
                        <TableCell className="font-semibold">{a.deduction_days}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {a.deduction_amount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {closed ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                              closed
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              open
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {adjustments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="py-6 text-center text-muted-foreground">
                        No closed months yet — run monthly close to generate adjustments.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <p className="border-t py-2.5 text-xs text-muted-foreground">
                Written by <Link className="underline underline-offset-3" href="/admin/close">monthly close</Link> ·
                corrections are blocked while a month is closed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-warm-100">
                {audit.map((a, i) => (
                  <li key={a._id?.toString() ?? i} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#1a1a1a]">{a.action}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.entity}</p>
                      {a.reason && <p className="mt-0.5 text-xs italic text-muted-foreground">“{a.reason}”</p>}
                    </div>
                    <div className="text-right text-xs text-warm-600">
                      <p>{a.actor}</p>
                      <p>{stamp(a.ts)}</p>
                    </div>
                  </li>
                ))}
                {audit.length === 0 && <li className="py-4 text-sm text-muted-foreground">No recorded activity.</li>}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <Row label="Email" value={employee.email} />
              <Row label="Status" value={employee.active ? "Active" : "Inactive"} />
              <Row
                label="Shift"
                value={
                  shift
                    ? `${shift.name} · ${shift.start_time}–${shift.end_time}`
                    : employee.shift_id
                }
              />
              <Row label="Weekly off" value={employee.weekly_off.map((d) => WEEKS[d]).join(", ") || "—"} />
              <Row label="Joined" value={employee.joined_at} />
              <Row label="Monthly gross" value={`${employee.monthly_gross.toLocaleString()} BDT`} />
              <Row label="Record created" value={stamp(employee.created_at)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Link
                href={`/admin/employees?edit=${employee._id.toString()}`}
                className={buttonVariants({ size: "sm", variant: "secondary" })}
              >
                Edit
              </Link>
              <Link
                href="/admin/sheet"
                className={buttonVariants({ size: "sm", variant: "secondary" })}
              >
                <History className="h-4 w-4" />
                Correct a day
              </Link>
              <form action={toggleEmployeeActive}>
                <input type="hidden" name="id" value={employee._id.toString()} />
                {employee.active ? (
                  <SubmitButton variant="destructive" size="sm">
                    Deactivate
                  </SubmitButton>
                ) : (
                  <SubmitButton size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
                    Activate
                  </SubmitButton>
                )}
              </form>
              <form action={deleteEmployee}>
                <input type="hidden" name="id" value={employee._id.toString()} />
                <ConfirmSubmit
                  message={`Delete ${employee.name} permanently? This also deletes ALL attendance, leave, and payroll history for this employee. This cannot be undone. Use Deactivate instead if you need to keep history.`}
                >
                  Delete employee
                </ConfirmSubmit>
              </form>
              {hasLogin && (
                <form action={removeEmployeeLogin}>
                  <input type="hidden" name="employee_id" value={employee._id.toString()} />
                  <ConfirmSubmit
                    message={`Remove the login for ${employee.email}? They will be signed out and must register again or have you create a new password. Attendance history stays intact. To block access, deactivate them instead.`}
                  >
                    Remove login
                  </ConfirmSubmit>
                </form>
              )}
            </CardContent>
          </Card>

          <CreateLoginCard
            employeeId={employee._id.toString()}
            email={employee.email}
            hasLogin={hasLogin}
          />

          <div>
            <h2 className="mb-2 font-serif text-lg font-bold tracking-tight text-[#1a1a1a]">
              Leave balance · {year}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {balances.map(({ type, balance }, i) => (
                <div
                  key={type._id}
                  className="rounded-2xl border border-warm-100 bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-warm-900/5"
                >
                  <span
                    className={cn(
                      "mb-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      BALANCE_TINTS[i % BALANCE_TINTS.length],
                    )}
                  >
                    {type.paid ? "Paid" : "Unpaid"}
                  </span>
                  <p className="text-xl font-bold text-[#1a1a1a]">
                    {balance.toFixed(balance % 1 === 0 ? 0 : 1)}
                  </p>
                  <p className="text-xs text-warm-600">{type.name} left</p>
                </div>
              ))}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Devices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {devices.map((d) => (
                <div key={d._id.toString()} className="rounded-2xl border border-warm-100 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-xs text-muted-foreground">{d.device_token.slice(0, 12)}…</p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                        DEVICE_STATUS_STYLES[d.status],
                      )}
                    >
                      {d.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-warm-600">Registered {stamp(d.created_at)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {d.status !== "approved" && (
                      <form action={setDeviceStatus}>
                        <input type="hidden" name="id" value={d._id.toString()} />
                        <input type="hidden" name="status" value="approved" />
                        <SubmitButton variant="ghost" size="sm" className="font-semibold text-emerald-700">
                          Approve
                        </SubmitButton>
                      </form>
                    )}
                    {d.status !== "revoked" && (
                      <form action={setDeviceStatus}>
                        <input type="hidden" name="id" value={d._id.toString()} />
                        <input type="hidden" name="status" value="revoked" />
                        <SubmitButton variant="ghost" size="sm" className="text-destructive">
                          Revoke
                        </SubmitButton>
                      </form>
                    )}
                    <form action={removeDevice}>
                      <input type="hidden" name="device_id" value={d._id.toString()} />
                      <input type="hidden" name="back" value={`/admin/employees/${employee._id}`} />
                      <ConfirmSubmit
                        message="Remove this device permanently? Fingerprints on it will be deleted too."
                      >
                        Remove
                      </ConfirmSubmit>
                    </form>
                  </div>
                </div>
              ))}
              {devices.length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">
                  No devices registered — none can check in yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
