"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { createEmployeeLogin, type LoginState } from "@/actions/login";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "cn";

const INITIAL: LoginState = { ok: false, message: "" };

export function CreateLoginCard({
  employeeId,
  email,
  hasLogin,
}: {
  employeeId: string;
  email: string;
  hasLogin: boolean;
}) {
  const [state, formAction, pending] = useActionState(createEmployeeLogin, INITIAL);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!state.email || !state.password) return;
    await navigator.clipboard.writeText(`${state.email}\n${state.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Login</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              hasLogin ? "bg-emerald-50 text-emerald-700" : "bg-warm-100 text-warm-600",
            )}
          >
            {hasLogin ? "password login active" : "no password login"}
          </span>
          <span className="text-xs text-warm-600">{email}</span>
        </div>
        <p className="text-xs text-warm-600">
          {hasLogin
            ? "Resetting generates a new password and invalidates the old one immediately."
            : "Sign-up is disabled, so the employee cannot create this themselves. Generate a password and hand it over."}
        </p>
        <form action={formAction}>
          <input type="hidden" name="employee_id" value={employeeId} />
          <Button
            type="submit"
            size="sm"
            loading={pending}
            variant={hasLogin ? "secondary" : "default"}
          >
            <KeyRound className="h-4 w-4" />
            {hasLogin ? "Reset password" : "Create login"}
          </Button>
        </form>

        {state.ok && state.password && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold text-emerald-800">{state.message}</p>
            <dl className="mt-2 space-y-1 font-mono text-xs text-emerald-900">
              <div>
                <dt className="inline font-sans font-semibold">Email: </dt>
                <dd className="inline">{state.email}</dd>
              </div>
              <div>
                <dt className="inline font-sans font-semibold">Password: </dt>
                <dd className="inline">{state.password}</dd>
              </div>
            </dl>
            <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={() => void copy()}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy credentials"}
            </Button>
            <p className="mt-2 text-[11px] text-emerald-700">
              Shown once. Ask them to change it on <span className="font-mono">/me/security</span> after
              signing in.
            </p>
          </div>
        )}

        {!state.ok && state.message && <p className="text-xs text-destructive">{state.message}</p>}
      </CardContent>
    </Card>
  );
}
