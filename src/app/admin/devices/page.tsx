import { collections } from "@/lib/mongo";
import { revokeWebAuthnCredentials, setDeviceStatus } from "@/actions/admin";
import { ErrorBanner } from "@/components/ui";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BIOMETRIC_POLICY } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Devices" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  revoked: "bg-red-50 text-red-700",
};

const POLICY_LABEL: Record<string, string> = {
  off: "off",
  optional: "on for enrolled devices",
  required: "on for everyone",
};

export default async function AdminDevicesPage({ searchParams }: Props) {
  const query = await searchParams;
  const error = typeof query?.error === "string" ? query.error : null;
  const devices = await collections().devices.find({}).sort({ created_at: 1 }).toArray();
  const employees = await collections().employees.find({}).toArray();
  const credentials = await collections().webauthnCredentials.find({}).toArray();
  const nameOf = new Map(employees.map((e) => [e._id.toString(), e.name]));
  const credCount = new Map<string, number>();
  for (const c of credentials) {
    credCount.set(c.device_token, (credCount.get(c.device_token) ?? 0) + 1);
  }

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold tracking-tight text-[#1a1a1a] sm:text-3xl">Devices</h1>
      <ErrorBanner message={error} />
      <p className="mt-1 text-sm text-muted-foreground">
        One device per install. A new device is{" "}
        <span className="font-semibold text-amber-700">pending</span> until you approve it —
        only approved devices can check in. Revoking a phone forces re-approval.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Fingerprint check:{" "}
        <span className="font-semibold text-sage-700">{POLICY_LABEL[BIOMETRIC_POLICY] ?? BIOMETRIC_POLICY}</span>
        {BIOMETRIC_POLICY !== "off" && " — employees set their own fingerprint up on the scan page."}
      </p>

      <Card className="mt-4">
        <Table maxHeight="max-h-[70vh]">
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Token (short)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Fingerprint</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.map((d) => {
              const enrolled = credCount.get(d.device_token) ?? 0;
              return (
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
                  <TableCell>
                    {enrolled > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        enrolled
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">none</span>
                    )}
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
                    {enrolled > 0 && (
                      <form action={revokeWebAuthnCredentials} className="inline">
                        <input type="hidden" name="device_id" value={d._id.toString()} />
                        <SubmitButton variant="ghost" size="sm" className="text-destructive">
                          Clear fingerprint
                        </SubmitButton>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {devices.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  No devices yet — they appear when someone scans on a new phone.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
