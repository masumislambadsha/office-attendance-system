import { collections } from "@/lib/mongo";
import { requireEmployee } from "@/auth";
import { getAllLeaveTypes, availableBalance } from "@/attend/leave";
import { nowDateKey } from "@/attend/service";
import { Card, CardContent, CardHeader, CardTitle, ErrorBanner } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { LeaveRequestForm } from "@/components/LeaveRequestForm";
import { cancelMyLeave } from "@/actions/leave";
import { cn } from "cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Request leave" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function MyLeavePage({ searchParams }: Props) {
  const query = await searchParams;
  const error = typeof query?.error === "string" ? query.error : null;
  const user = await requireEmployee();
  const employee = await collections().employees.findOne({ email: user.email.toLowerCase(), active: true });
  const today = nowDateKey();
  const year = Number(today.slice(0, 4));

  if (!employee) {
    return (
      <Card className="m-6">
        <CardContent className="p-6">
          <p className="text-sm font-medium text-amber-700">No active employee record for {user.email}.</p>
        </CardContent>
      </Card>
    );
  }

  const types = await getAllLeaveTypes();
  const options = await Promise.all(
    types.map(async (t) => ({ id: t._id, name: t.name, paid: t.paid, balance: await availableBalance(employee._id, t._id, year) })),
  );

  const myRequests = await collections()
    .leaveRequests.find({ employee_id: employee._id, status: { $in: ["pending", "approved"] } })
    .sort({ created_at: -1 })
    .toArray();

  const typeName = new Map(types.map((t) => [t._id, t.name]));

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold tracking-tight text-[#1a1a1a] sm:text-3xl">Request leave</h1>
      <ErrorBanner message={error} />

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">New request</CardTitle>
        </CardHeader>
        <CardContent>
          <LeaveRequestForm types={options} today={today} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>My open requests</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {myRequests.map((r) => (
              <div
                key={r._id.toString()}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-warm-100 py-3 text-sm last:border-0"
              >
                <div>
                  <span className="font-medium">{typeName.get(r.type_id) ?? r.type_id}</span>
                  <span className="ml-2 text-muted-foreground">
                    {r.from} → {r.to} {r.half_day ? "(½)" : ""}
                  </span>
                  {r.status === "approved" ? (
                    <span
                      className={cn(
                        "ml-2 inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold",
                        "text-emerald-700",
                      )}
                    >
                      approved
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "ml-2 inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold",
                        "text-amber-700",
                      )}
                    >
                      pending
                    </span>
                  )}
                </div>
                {r.status === "pending" && (
                  <form action={cancelMyLeave}>
                    <input type="hidden" name="id" value={r._id.toString()} />
                    <SubmitButton variant="ghost" size="sm" className="text-muted-foreground">
                      Cancel
                    </SubmitButton>
                  </form>
                )}
              </div>
            ))}
            {myRequests.length === 0 && <p className="text-sm text-muted-foreground">Nothing open.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}