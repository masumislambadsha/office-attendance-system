import Link from "next/link";
import { collections } from "@/lib/mongo";
import { toggleEmployeeActive } from "@/actions/admin";
import { EmployeeFormDialog } from "@/components/employee-form-dialog";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Employees" };

const WEEK_OPTIONS: Array<[string, string]> = [
  ["0", "Sun"],
  ["1", "Mon"],
  ["2", "Tue"],
  ["3", "Wed"],
  ["4", "Thu"],
  ["5", "Fri"],
  ["6", "Sat"],
];

export default async function AdminEmployeesPage() {
  const [employees, shifts] = await Promise.all([
    collections().employees.find({}).sort({ name: 1 }).toArray(),
    collections().shifts.find({}).toArray(),
  ]);
  const shiftNames = new Map(shifts.map((s) => [s._id, s.name]));

  const employeesPlain = employees.map((e) => ({
    _id: e._id.toString(),
    name: e.name,
    email: e.email,
    shift_id: e.shift_id,
    weekly_off: e.weekly_off,
    joined_at: e.joined_at,
    monthly_gross: e.monthly_gross,
    active: e.active,
  }));

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-2xl font-bold tracking-tight text-[#1a1a1a] sm:text-3xl">Employees</h1>
        <EmployeeFormDialog employees={employeesPlain} shifts={shifts} />
      </div>

      <Card className="mt-4">
        <Table maxHeight="max-h-[70vh]">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Weekly off</TableHead>
              <TableHead>Gross</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((e) => (
              <TableRow key={e._id.toString()}>
                <TableCell className="font-medium">
                  <Link
                    href={`/admin/employees/${e._id.toString()}`}
                    className="font-medium text-[#1a1a1a] hover:text-sage-700 hover:underline underline-offset-3"
                  >
                    {e.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{e.email}</TableCell>
                <TableCell className="text-muted-foreground">{shiftNames.get(e.shift_id) ?? e.shift_id}</TableCell>
                <TableCell className="text-muted-foreground">{e.weekly_off.map((d) => WEEK_OPTIONS[d]?.[1]).join(", ")}</TableCell>
                <TableCell className="text-muted-foreground">{e.monthly_gross.toLocaleString()}</TableCell>
                <TableCell className="text-muted-foreground">{e.joined_at}</TableCell>
                <TableCell>
                  {e.active ? (
                    <span className="font-bold text-emerald-700">yes</span>
                  ) : (
                    <span className="text-muted-foreground">no</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <a
                    href={`/admin/employees?edit=${e._id}`}
                    className="mr-2 text-sm font-medium text-primary hover:underline"
                  >
                    Edit
                  </a>
                  <form action={toggleEmployeeActive} className="inline">
                    <input type="hidden" name="id" value={e._id.toString()} />
                    {e.active ? (
                      <SubmitButton variant="destructive" size="sm">
                        Deactivate
                      </SubmitButton>
                    ) : (
                      <SubmitButton size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
                        Activate
                      </SubmitButton>
                    )}
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
