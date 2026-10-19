import { collections } from "@/lib/mongo";
import { decideLeave } from "@/actions/leave";
import { ErrorBanner } from "@/components/ui";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leaves" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  cancelled: "bg-warm-100 text-warm-600",
};

export default async function AdminLeavesPage({ searchParams }: Props) {
  const query = await searchParams;
  const error = typeof query?.error === "string" ? query.error : null;
  const [requests, employees, types] = await Promise.all([
    collections().leaveRequests.find({}).sort({ created_at: -1 }).toArray(),
    collections().employees.find({}).toArray(),
    collections().leaveTypes.find({}).toArray(),
  ]);
  const nameOf = new Map(employees.map((e) => [e._id.toString(), e.name]));
  const typeName = new Map(types.map((t) => [t._id, t.name]));

  const pending = requests.filter((r) => r.status === "pending");
  const history = requests.filter((r) => r.status !== "pending");

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold tracking-tight text-[#1a1a1a] sm:text-3xl">Leave requests</h1>
      <ErrorBanner message={error} />

      <h2 className="mt-5 font-serif text-lg font-bold tracking-tight text-[#1a1a1a]">Awaiting decision ({pending.length})</h2>
      <div className="mt-2 space-y-2">
        {pending.map((r) => (
          <Card
            key={r._id.toString()}
            className="border-amber-200 bg-amber-50/40"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
              <div>
                <p className="font-medium">
                  {nameOf.get(r.employee_id.toString()) ?? "?"}{" "}
                  <span className="ml-2 rounded-full bg-warm-100 px-2 py-0.5 text-xs text-warm-600">
                    {typeName.get(r.type_id) ?? r.type_id}
                  </span>
                  {r.half_day && <span className="ml-1 text-xs text-muted-foreground">half-day</span>}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {r.from} → {r.to} · {r.requested_days} day(s)
                </p>
                {r.reason && <p className="mt-1 text-sm italic text-muted-foreground">“{r.reason}”</p>}
              </div>
              <div className="flex gap-2">
                <form action={decideLeave}>
                  <input type="hidden" name="id" value={r._id.toString()} />
                  <input type="hidden" name="action" value="approved" />
                  <SubmitButton size="sm">
                    Approve
                  </SubmitButton>
                </form>
                <form action={decideLeave}>
                  <input type="hidden" name="id" value={r._id.toString()} />
                  <input type="hidden" name="action" value="rejected" />
                  <SubmitButton size="sm" variant="destructive">
                    Reject
                  </SubmitButton>
                </form>
              </div>
            </div>
          </Card>
        ))}
        {pending.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting.</p>}
      </div>

      <h2 className="mt-6 font-serif text-lg font-bold tracking-tight text-[#1a1a1a]">History ({history.length})</h2>
      <Card className="mt-2">
        <Table maxHeight="max-h-[70vh]">
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Days</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((r) => (
              <TableRow key={r._id.toString()}>
                <TableCell className="font-medium">{nameOf.get(r.employee_id.toString()) ?? "?"}</TableCell>
                <TableCell>{typeName.get(r.type_id) ?? r.type_id}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.from} → {r.to}
                  {r.half_day ? " (½)" : ""}
                </TableCell>
                <TableCell>{r.requested_days}</TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                      STATUS_STYLES[r.status]
                    }`}
                  >
                    {r.status}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.created_at.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}