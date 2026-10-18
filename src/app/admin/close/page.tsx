import { collections } from "@/lib/mongo";
import { closeMonthAction, reopenMonthAction, updateDeductionRule } from "@/actions/admin";
import { latestJobRun } from "@/attend/payroll";
import { monthLabel } from "@/attend/leave";
import { currentMonthKey } from "@/lib/time";
import { Row, ErrorBanner } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberFieldField } from "@/components/ui/number-field";
import { SelectField } from "@/components/ui/select";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monthly close" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminClosePage({ searchParams }: Props) {
  const query = await searchParams;
  const error = typeof query?.error === "string" ? query.error : null;
  const [rules, closes, job] = await Promise.all([
    collections().deductionRules.find({}).sort({ _id: 1 }).toArray(),
    collections().payrollCloses.find({}).sort({ _id: 1 }).toArray(),
    latestJobRun(),
  ]);

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold tracking-tight text-[#1a1a1a] sm:text-3xl">Monthly close</h1>
      <ErrorBanner message={error} />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Close a month</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Locks the month&apos;s statuses, computes deductions (see rules), credits earned leave,
              and writes payroll_adjustments. A second close of the same month is refused.
            </p>
            <form action={closeMonthAction} className="mt-3 flex items-end gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="close-month">Month</Label>
                <input
                  id="close-month"
                  name="month"
                  type="month"
                  required
                  defaultValue={currentMonthKey()}
                  className="form-input"
                />
              </div>
              <Button type="submit">Close month</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reopen a month</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Unlocks corrections for a closed month. Re-closing recomputes and overwrites that
              month&apos;s adjustments.
            </p>
            <form action={reopenMonthAction} className="mt-3 flex items-end gap-3">
              <div className="grid min-w-[180px] gap-1.5">
                <Label id="reopen-month-label">Closed month</Label>
                <SelectField
                  name="month"
                  labelledBy="reopen-month-label"
                  placeholder="No closed months"
                  options={closes.map((c) => ({ value: c._id, label: `${c._id} (${monthLabel(c._id)})` }))}
                  defaultValue={closes[0]?._id}
                />
              </div>
              <Button type="submit" variant="destructive">
                Reopen
              </Button>
            </form>
            {closes.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">No closed months yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Deduction rules (config — editable)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {rules.map((r) => (
              <form key={r._id} action={updateDeductionRule} className="flex items-center gap-2">
                <input type="hidden" name="key" value={r._id} />
                <input type="hidden" name="label" value={r.label} />
                <div className="flex-1">
                  <span className="text-sm text-foreground">{r.label}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{r._id}</span>
                </div>
                <NumberFieldField
                  name="value"
                  step="any"
                  defaultValue={r.value}
                  ariaLabel={r.label}
                  className="w-20"
                />
                <Button type="submit" variant="secondary" size="sm">
                  Save
                </Button>
              </form>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm">System</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Row
            label="Nightly status job"
            value={
              job ? `${job.status} · target ${job.date ?? "—"} · ${job.processed ?? 0} rows` : "never run"
            }
          />
          <Row label="Closed months" value={closes.length ? closes.map((c) => c._id).join(", ") : "none"} />
        </CardContent>
      </Card>
    </div>
  );
}