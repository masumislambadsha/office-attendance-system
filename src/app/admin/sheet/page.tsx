import Link from "next/link";
import { collections } from "@/lib/mongo";
import { clearManualOverride, manualCorrect } from "@/actions/admin";
import { monthlySheet } from "@/attend/payroll";
import { monthLabel } from "@/attend/leave";
import { currentMonthKey, daysInMonth, rangeKeys } from "@/lib/time";
import { CORRECTABLE_STATUSES, DayStatus } from "@/attend/types";
import { ErrorBanner } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { DateRangePickerField } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monthly sheet" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminSheetPage({ searchParams }: Props) {
  const query = await searchParams;
  const error = typeof query?.error === "string" ? query.error : null;
  const month = typeof query?.month === "string" && /^\d{4}-\d{2}$/.test(query.month) ? query.month : currentMonthKey();
  const [sheet, employees, closes, holidays, rules] = await Promise.all([
    monthlySheet(month),
    collections().employees.find({ active: true }).sort({ name: 1 }).toArray(),
    collections().payrollCloses.find({ _id: month }).toArray(),
    collections().holidays.find({ _id: { $regex: `^${month}-` } }).toArray(),
    collections().deductionRules.find({}).toArray(),
  ]);
  const holidaySet = new Set(holidays.map((h) => String(h._id)));
  const isClosed = closes.length > 0;
  const totalDays = daysInMonth(month);
  const holidayCount = rangeKeys(`${month}-01`, `${month}-${String(totalDays).padStart(2, "0")}`).filter((d) =>
    holidaySet.has(d),
  ).length;
  const ruleValue = (key: string, fallback: number) =>
    Math.max(1, rules.find((r) => r._id === key)?.value ?? fallback);
  const halfMul = rules.find((r) => r._id === "half_day_multiplier")?.value ?? 0.5;
  const unpaidMul = rules.find((r) => r._id === "unpaid_leave_multiplier")?.value ?? 1;
  const latesPerAbsent = ruleValue("lates_per_absent", 3);
  const divisor = ruleValue("absent_day_divisor", 30);

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold tracking-tight text-[#1a1a1a] sm:text-3xl">Monthly sheet · {monthLabel(month)}</h1>
      <ErrorBanner message={error} />

      <form className="mt-3 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="sheet-month">Month</Label>
          <input id="sheet-month" name="month" type="month" defaultValue={month} className="form-input" />
        </div>
        <SubmitButton variant="secondary">
          Show
        </SubmitButton>
        {isClosed ? (
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            closed — corrections blocked
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            open — corrections allowed
          </span>
        )}
        {sheet.length > 0 && (
          <>
            <a href={`/api/admin/sheet?month=${month}&format=csv`} className={buttonVariants({ variant: "secondary" })}>
              CSV
            </a>
            <a href={`/api/admin/sheet?month=${month}&format=json`} className={buttonVariants({ variant: "secondary" })}>
              v1 JSON
            </a>
          </>
        )}
      </form>

      {sheet.length === 0 ? (
        <p className="mt-6 text-sm text-amber-600">
          No adjustments yet — run{" "}
          <Link className="underline underline-offset-3" href="/admin/close">
            Monthly close
          </Link>{" "}
          for this month first.
        </p>
      ) : (
        <Card className="mt-4">
          <Table maxHeight="max-h-[70vh]">
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Work</TableHead>
                <TableHead>P</TableHead>
                <TableHead>Late</TableHead>
                <TableHead>½</TableHead>
                <TableHead>Abs</TableHead>
                <TableHead>L(p)</TableHead>
                <TableHead>L(u)</TableHead>
                <TableHead>Ded days</TableHead>
                <TableHead className="text-right">Amount (BDT)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheet.map((r) => (
                <TableRow key={r.employee_id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.working_days}</TableCell>
                  <TableCell className="font-semibold text-emerald-700">{r.present}</TableCell>
                  <TableCell className="font-semibold text-amber-700">{r.late}</TableCell>
                  <TableCell className="font-semibold text-orange-700">{r.half_days}</TableCell>
                  <TableCell className="font-semibold text-red-700">{r.absents}</TableCell>
                  <TableCell className="font-semibold text-sky-700">{r.leave_paid}</TableCell>
                  <TableCell className="font-semibold text-violet-700">{r.leave_unpaid}</TableCell>
                  <TableCell className="font-semibold">{r.deduction_days}</TableCell>
                  <TableCell className="text-right font-semibold">{r.deduction_amount.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
            {totalDays} calendar days · {holidayCount} holidays in month. Deduction days = absents +
            {halfMul} × half-days + {unpaidMul} × unpaid leave days + floor(lates / {latesPerAbsent});
            amount = gross / {divisor} × deduction days.
          </p>
        </Card>
      )}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Manual correction</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Overrides a day&apos;s status with a mandatory reason. Pick a single day or a span to apply the same
            status across the range. Every correction is appended to the audit log. Blocked while the month is closed{" "}
            {isClosed ? (
              <span className="text-amber-600">— reopen it first.</span>
            ) : (
              <span>— month is open.</span>
            )}
          </p>
          <form action={manualCorrect} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SelectField
              name="employee_id"
              ariaLabel="Employee"
              options={employees.map((e) => ({ value: e._id.toString(), label: e.name }))}
              defaultValue={employees[0]?._id.toString()}
              isRequired
            />
            <DateRangePickerField name="from" endName="to" ariaLabel="Date or date range" isRequired />
            <SelectField
              name="status"
              ariaLabel="Status"
              options={CORRECTABLE_STATUSES.map((s: DayStatus) => ({
                value: s,
                label: s.replace("_", " "),
              }))}
              defaultValue={"present"}
              isRequired
            />
            <Input name="reason" required placeholder="Reason (mandatory)" aria-label="Reason (mandatory)" />
            <SubmitButton variant="destructive" disabled={isClosed}>
              Apply correction
            </SubmitButton>
          </form>

          <div className="mt-6 border-t border-warm-100 pt-4">
            <p className="mb-2 text-sm font-medium text-[#1a1a1a]">Clear manual override</p>
            <p className="mb-2 text-xs text-muted-foreground">
              Removes manual overrides and restores the computed status — for one day or a whole range.
            </p>
            <form action={clearManualOverride} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SelectField
                name="employee_id"
                ariaLabel="Employee"
                options={employees.map((e) => ({ value: e._id.toString(), label: e.name }))}
                defaultValue={employees[0]?._id.toString()}
                isRequired
              />
              <DateRangePickerField name="from" endName="to" ariaLabel="Date or date range" isRequired />
              <SubmitButton variant="secondary" disabled={isClosed}>
                Clear override
              </SubmitButton>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}