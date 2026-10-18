import Link from "next/link";
import { collections } from "@/lib/mongo";
import { saveShift } from "@/actions/admin";
import { ErrorBanner } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberFieldField } from "@/components/ui/number-field";
import { TimeFieldField } from "@/components/ui/time-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shifts" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminShiftsPage({ searchParams }: Props) {
  const query = await searchParams;
  const error = typeof query?.error === "string" ? query.error : null;
  const editId = typeof query?.edit === "string" ? query.edit : null;
  const shifts = await collections().shifts.find({}).sort({ _id: 1 }).toArray();
  const overrides = await collections().shiftOverrides.find({}).sort({ date_from: 1 }).toArray();
  const editing = editId ? shifts.find((s) => s._id === editId) ?? null : null;

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold tracking-tight text-[#1a1a1a] sm:text-3xl">Shifts</h1>
      <ErrorBanner message={error} />

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{editing ? `Edit shift · ${editing.name}` : "Add / edit shift"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveShift} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {editing && <input type="hidden" name="id" value={editing._id} />}
            <Input name="name" required defaultValue={editing?.name} placeholder="Name (e.g. Day Shift)" aria-label="Shift name" />
            <TimeFieldField name="start_time" defaultValue={editing?.start_time ?? "09:00"} ariaLabel="Start time" isRequired />
            <TimeFieldField name="end_time" defaultValue={editing?.end_time ?? "18:00"} ariaLabel="End time" isRequired />
            <NumberFieldField
              name="grace_min"
              minValue={0}
              defaultValue={editing?.grace_min ?? 10}
              placeholder="Grace (min)"
              ariaLabel="Grace minutes"
            />
            <NumberFieldField
              name="half_day_after_min"
              minValue={0}
              defaultValue={editing?.half_day_after_min ?? 60}
              placeholder="Half-day after"
              ariaLabel="Half-day after minutes"
            />
            <NumberFieldField
              name="early_exit_min"
              minValue={0}
              defaultValue={editing?.early_exit_min ?? 60}
              placeholder="Early-exit (min)"
              ariaLabel="Early exit minutes"
            />
            <div className="sm:col-span-2 lg:col-span-6">
              <Button type="submit">{editing ? "Save changes" : "Save shift"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {shifts.map((s) => (
          <Card key={s._id}>
            <CardContent className="px-4 py-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{s.name}</h3>
                <span className="flex items-center gap-2">
                  <Link href={`/admin/shifts?edit=${s._id}`} className="text-xs font-medium text-blue-600 hover:underline">
                    Edit
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">{s._id}</span>
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {s.start_time}–{s.end_time} · grace {s.grace_min}m · half-day after {s.half_day_after_min}m · early-exit{" "}
                {s.early_exit_min}m
                {s.end_time < s.start_time && (
                  <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">
                    crosses midnight
                  </span>
                )}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mt-6 font-serif text-lg font-bold tracking-tight text-[#1a1a1a]">Shift overrides (Ramadan / seasonal hours)</h2>
      <p className="text-sm text-muted-foreground">
        Overrides are stored by date range. Add them via MongoDB (no UI in v1) — e.g.{" "}
        <code className="rounded-lg bg-warm-100 px-1 py-0.5 font-mono text-xs">shift_overrides</code>.
      </p>
      <Card className="mt-2">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shift</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overrides.map((o) => (
                <TableRow key={o._id.toString()}>
                  <TableCell>{o.shift_id}</TableCell>
                  <TableCell>{o.date_from}</TableCell>
                  <TableCell>{o.date_to}</TableCell>
                  <TableCell>
                    {o.start_time}–{o.end_time}
                  </TableCell>
                </TableRow>
              ))}
              {overrides.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                    No overrides yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}