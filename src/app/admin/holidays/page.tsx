import { collections } from "@/lib/mongo";
import { addHoliday, removeHoliday } from "@/actions/admin";
import { ErrorBanner } from "@/components/ui";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { DateRangePickerField } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Holidays" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type Group = { from: string; to: string; name: string; days: number };

/** Collapses consecutive dates that share a name into a single range row. */
function groupByName(rows: { _id: string; name: string }[]): Group[] {
  const groups: Group[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.name === row.name) {
      last.to = row._id;
      last.days += 1;
    } else {
      groups.push({ from: row._id, to: row._id, name: row.name, days: 1 });
    }
  }
  return groups;
}

export default async function AdminHolidaysPage({ searchParams }: Props) {
  const query = await searchParams;
  const error = typeof query?.error === "string" ? query.error : null;
  const holidays = await collections().holidays.find({}).sort({ _id: 1 }).toArray();
  const groups = groupByName(holidays.map((h) => ({ _id: String(h._id), name: String(h.name) })));

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold tracking-tight text-[#1a1a1a] sm:text-3xl">BD holiday calendar</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Mark one day or a whole span — every day from start to end is stored as its own holiday, so a week off is a
        single entry here.
      </p>
      <ErrorBanner message={error} />

      <Card className="mt-4">
        <CardContent>
          <form action={addHoliday} className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-[260px] gap-1.5">
              <Label id="holiday-range-label">Dates</Label>
              <DateRangePickerField name="from" endName="to" labelledBy="holiday-range-label" isRequired />
              </div>
            <div className="grid min-w-[200px] flex-1 gap-1.5">
              <Label htmlFor="holiday-name">Name</Label>
              <Input
                id="holiday-name"
                name="name"
                required
                placeholder="e.g. Winter Holiday Week"
                aria-label="Holiday name"
              />
            </div>
            <SubmitButton>Add holiday</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <Table maxHeight="max-h-[70vh]">
          <TableHeader>
            <TableRow>
              <TableHead>Dates</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Days</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <TableRow key={`${g.from}-${g.name}`}>
                <TableCell className="font-mono text-xs font-medium">
                  {g.from === g.to ? g.from : `${g.from} → ${g.to}`}
                </TableCell>
                <TableCell>{g.name}</TableCell>
                <TableCell className="text-right text-muted-foreground">{g.days}</TableCell>
                <TableCell className="text-right">
                  <form action={removeHoliday} className="inline">
                    <input type="hidden" name="from" value={g.from} />
                    <input type="hidden" name="to" value={g.to} />
                    <SubmitButton variant="ghost" size="sm" className="text-destructive">
                      Remove
                    </SubmitButton>
                  </form>
                </TableCell>
              </TableRow>
            ))}
            {groups.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                  No holidays yet — load the 2026–27 BD govt calendar at setup.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
