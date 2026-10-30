import type { Metadata } from "next";
import { requireEmployee } from "@/auth";
import { ChangePasswordForm } from "@/components/change-password-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  const user = await requireEmployee();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-[#1a1a1a]">Security</h1>
        <p className="mt-1 text-sm text-warm-600">
          Signed in as <span className="font-medium text-[#1a1a1a]">{user.email}</span>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <p className="text-xs text-warm-500">
        No password yet? Ask an admin to create a login from your employee page, then change the
        temporary password here.
      </p>
    </div>
  );
}
