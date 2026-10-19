"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveEmployee } from "@/actions/admin";
import { ErrorBanner } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Checkbox } from "@heroui/react";
import { DateRangePickerField } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberFieldField } from "@/components/ui/number-field";
import { SelectField } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const WEEK_OPTIONS: Array<[string, string]> = [
  ["0", "Sun"],
  ["1", "Mon"],
  ["2", "Tue"],
  ["3", "Wed"],
  ["4", "Thu"],
  ["5", "Fri"],
  ["6", "Sat"],
];

type Employee = {
  _id: string;
  name: string;
  email: string;
  shift_id: string;
  weekly_off: number[];
  joined_at: string;
  monthly_gross: number;
  active: boolean;
  biometric_exempt?: boolean;
};

type Shift = { _id: string; name: string };

export function EmployeeFormDialog({ employees, shifts }: { employees: Employee[]; shifts: Shift[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const error = searchParams.get("error");
  const editing = editId ? employees.find((e) => e._id === editId) ?? null : null;

  const [addOpen, setAddOpen] = React.useState(false);
  const open = addOpen || Boolean(editing);

  const close = React.useCallback(() => {
    setAddOpen(false);
    if (editId || error || addOpen) router.replace("/admin/employees");
  }, [addOpen, editId, error, router]);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setAddOpen(true) : close())}>
      <Button onPress={() => setAddOpen(true)}>Add employee</Button>
      <DialogContent size="md" className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : "Add employee"}</DialogTitle>
        </DialogHeader>
        <ErrorBanner message={error} />
        <form action={saveEmployee} className="grid gap-4 sm:grid-cols-2">
          {editing && <input type="hidden" name="id" value={editing._id} />}

          <div className="grid gap-1.5">
            <Label id="emp-name-label" className="text-xs text-muted-foreground">
              Full name
            </Label>
            <Input
              name="name"
              defaultValue={editing?.name}
              required
              placeholder="e.g. Masum Islam Badsha"
              aria-labelledby="emp-name-label"
            />
          </div>

          <div className="grid gap-1.5">
            <Label id="emp-email-label" className="text-xs text-muted-foreground">
              Email
            </Label>
            <Input
              name="email"
              type="email"
              defaultValue={editing?.email}
              required
              placeholder="name@company.com"
              aria-labelledby="emp-email-label"
            />
          </div>

          <div className="grid gap-1.5">
            <Label id="emp-shift-label" className="text-xs text-muted-foreground">
              Shift
            </Label>
            <SelectField
              name="shift_id"
              labelledBy="emp-shift-label"
              options={shifts.map((s) => ({ value: s._id, label: s.name }))}
              defaultValue={editing?.shift_id}
              isRequired
            />

          </div>

          <div className="grid gap-1.5">
            <Label id="emp-join-label" className="text-xs text-muted-foreground">
              Join date
            </Label>
            <DateRangePickerField
              name="joined_at"
              endName="joined_at_end"
              labelledBy="emp-join-label"
              defaultFrom={editing?.joined_at}
              isRequired
            />

          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label id="emp-gross-label" className="text-xs text-muted-foreground">
              Monthly gross salary (BDT)
            </Label>
            <NumberFieldField
              name="monthly_gross"
              labelledBy="emp-gross-label"
              defaultValue={editing?.monthly_gross}
              minValue={0}
              placeholder="e.g. 45000"
              className="w-52"
            />

          </div>

          <div className="sm:col-span-2">
            <Label id="emp-weekly-off-label" className="text-xs text-muted-foreground">
              Weekly off
            </Label>
            <div className="ml-2 mt-1.5 inline-flex flex-wrap gap-2">
              {WEEK_OPTIONS.map(([v, label]) => (
                <Checkbox
                  key={v}
                  name="weekly_off"
                  value={v}
                  defaultSelected={editing?.weekly_off.includes(Number(v)) ?? false}
                  className="text-sm gap-0"
                >
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    {label}
                  </Checkbox.Content>
                </Checkbox>
              ))}
            </div>

          </div>

          <div className="sm:col-span-2">
            <Label id="emp-active-label" className="text-xs text-muted-foreground">
              Employment status
            </Label>
            <Checkbox
              name="active"
              defaultSelected={editing?.active ?? true}
              className="mt-1.5 text-sm"
              aria-labelledby="emp-active-label"
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                Active
              </Checkbox.Content>
            </Checkbox>

          </div>

          <div className="sm:col-span-2">
            <Label id="emp-biometric-label" className="text-xs text-muted-foreground">
              Fingerprint check
            </Label>
            <Checkbox
              name="biometric_exempt"
              defaultSelected={editing?.biometric_exempt ?? false}
              className="mt-1.5 text-sm"
              aria-labelledby="emp-biometric-label"
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                Exempt — check in without a fingerprint (phone has no sensor)
              </Checkbox.Content>
            </Checkbox>
          </div>

          <DialogFooter className="sm:col-span-2">
            <SubmitButton>{editing ? "Save changes" : "Add employee"}</SubmitButton>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
