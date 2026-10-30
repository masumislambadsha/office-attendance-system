"use client";

import { useActionState } from "react";
import { changeOwnPassword, type PasswordState } from "@/actions/login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: PasswordState = { ok: false, message: "" };

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changeOwnPassword, INITIAL);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="current_password">Current password</Label>
        <Input
          id="current_password"
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="new_password">New password</Label>
        <Input
          id="new_password"
          name="new_password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
        <p className="text-xs text-warm-500">At least 10 characters.</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="confirm_password">Confirm new password</Label>
        <Input
          id="confirm_password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </div>
      <Button type="submit" loading={pending}>
        Change password
      </Button>
      {state.message && (
        <p className={state.ok ? "text-sm font-medium text-emerald-700" : "text-sm text-destructive"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
