import { collections } from "@/lib/mongo";
import { setDeviceStatus } from "@/actions/admin";
import { ErrorBanner } from "@/components/ui";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Devices" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  revoked: "bg-red-50 text-red-700",
};

export default async function AdminDevicesPage({ searchParams }: Props) {
  const query = await searchParams;
  const error = typeof query?.error === "string" ? query.error : null;
  const devices = await collections().devices.find({}).sort({ created_at: 1 }).toArray();
  const employees = await collections().employees.find({}).toArray();
  const nameOf = new Map(employees.map((e) => [e._id.toString(), e.name]));

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold tracking-tight text-[#1a1a1a] sm:text-3xl">Devices</h1>
      <ErrorBanner message={error} />
      <p className="mt-1 text-sm text-muted-foreground">
        One device per install. A new device is{" "}
        <span className="font-semibold text-amber-700">pending</span> until you approve it —
        only approved devices can check in. Revoking a phone forces re-approval.
      </p>

      <Card className="mt-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Token (short)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((d) => (
                <TableRow key={d._id.toString()}>
                  <TableCell className="font-medium">{nameOf.get(d.employee_id.toString()) ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {d.device_token.slice(0, 12)}…
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                        STATUS_STYLES[d.status]
                      }`}
                    >
                      {d.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {d.created_at.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
                  </TableCell>
                  <TableCell className="text-right">
                    {d.status !== "approved" && (
                      <form action={setDeviceStatus} className="inline">
                        <input type="hidden" name="id" value={d._id.toString()} />
                        <input type="hidden" name="status" value="approved" />
                        <SubmitButton variant="ghost" size="sm" className="mr-1 font-semibold text-emerald-700">
                          Approve
                        </SubmitButton>
                      </form>
                    )}
                    {d.status !== "revoked" && (
                      <form action={setDeviceStatus} className="inline">
                        <input type="hidden" name="id" value={d._id.toString()} />
                        <input type="hidden" name="status" value="revoked" />
                        <SubmitButton variant="ghost" size="sm" className="text-destructive">
                          Revoke
                        </SubmitButton>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {devices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    No devices yet — they appear when someone scans on a new phone.
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