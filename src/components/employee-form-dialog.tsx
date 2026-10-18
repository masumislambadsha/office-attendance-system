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
        <form action={saveEmployee} className="grid gap-3 sm:grid-cols-2">
          {editing && <input type="hidden" name="id" value={editing._id} />}
          <Input name="name" defaultValue={editing?.name} required placeholder="Full name" aria-label="Full name" />
          <Input
            name="email"
            type="email"
            defaultValue={editing?.email}
            required
            placeholder="Email"
            aria-label="Email"
          />
          <SelectField
            name="shift_id"
            ariaLabel="Shift"
            options={shifts.map((s) => ({ value: s._id, label: s.name }))}
            defaultValue={editing?.shift_id}
          />
          <DateRangePickerField
            name="joined_at"
            endName="joined_at_end"
            ariaLabel="Join date"
            defaultFrom={editing?.joined_at}
            isRequired
          />
          <NumberFieldField
            name="monthly_gross"
            ariaLabel="Monthly gross (BDT)"
            defaultValue={editing?.monthly_gross}
            minValue={0}
            placeholder="Monthly gross (BDT)"
          />
          <div className="sm:col-span-2">
            <span className="mr-2 text-sm text-muted-foreground">Weekly off:</span>
            <div className="inline-flex flex-wrap gap-2">
              {WEEK_OPTIONS.map(([v, label]) => (
                <Checkbox
                  key={v}
                  name="weekly_off"
                  value={v}
                  defaultSelected={editing?.weekly_off.includes(Number(v)) ?? false}
                  className="text-sm"
                >
                  <Checkbox.Content>
                    {label}
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox.Content>
                </Checkbox>
              ))}
            </div>
          </div>
          <Checkbox name="active" defaultSelected={editing?.active ?? true} className="text-sm">
            <Checkbox.Content>
              Active
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
            </Checkbox.Content>
          </Checkbox>
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