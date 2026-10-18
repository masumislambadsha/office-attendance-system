"use client";

import { useActionState } from "react";
import { Checkbox } from "@heroui/react";
import { requestLeaveState, type LeaveActionResult } from "@/actions/leave";
import { ActionError } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { DateRangePickerField } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";

export interface LeaveTypeOption {
  id: string;
  name: string;
  paid: boolean;
  balance: number;
}

export function LeaveRequestForm({ types, today }: { types: LeaveTypeOption[]; today: string }) {
  const [state, action, pending] = useActionState<LeaveActionResult, FormData>(requestLeaveState, { ok: true });

  return (
    <div>
      {state.ok && state.message && (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
          {state.message}
        </p>
      )}
      <ActionError error={state.ok ? null : (state.error ?? "request failed")} />
      <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label id="leave-type-label">Leave type</Label>
          <SelectField
            name="type_id"
            labelledBy="leave-type-label"
            defaultValue=""
            placeholder="Leave type…"
            options={types.map((t) => ({
              value: t.id,
              label: `${t.name} · ${t.balance.toFixed(t.balance % 1 === 0 ? 0 : 1)} left ${t.paid ? "" : "(unpaid)"}`,
            }))}
            isRequired
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label id="leave-range-label">From – to</Label>
          <DateRangePickerField
            name="from"
            endName="to"
            labelledBy="leave-range-label"
            minValue={today}
            isRequired
          />
        </div>
        <Checkbox name="half_day" className="pt-5 text-sm">
          <Checkbox.Content>
            Half day
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox.Content>
        </Checkbox>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="leave-reason">Reason (optional)</Label>
          <Input id="leave-reason" name="reason" placeholder="Reason (optional)" aria-label="Reason (optional)" />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" loading={pending}>
            Submit request
          </Button>
        </div>
      </form>
    </div>
  );
}