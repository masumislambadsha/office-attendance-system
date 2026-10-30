import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Lock, Mail, TriangleAlert } from "lucide-react";
import { currentSession } from "@/auth";
import { registerEmployee } from "@/actions/login";
import { SubmitButton } from "@/components/ui/submit-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create account" };

const ERROR_MESSAGES: Record<string, string> = {
  missing: "Enter your work email and a password.",
  bad_email: "Enter a valid work email.",
  not_employee:
    "That email isn't on the active employee list. Ask your admin to add you first.",
  exists: "An account already exists for this email. Sign in instead.",
  short: "Use a password with at least 10 characters.",
  mismatch: "The two passwords do not match.",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RegisterPage({ searchParams }: Props) {
  const session = await currentSession();
  if (session) redirect(session.user.role === "admin" ? "/admin" : "/me");

  const query = await searchParams;
  const errorCode = typeof query.error === "string" ? query.error : "";
  const error = ERROR_MESSAGES[errorCode] ?? null;
  const email = typeof query.email === "string" ? query.email : "";

  return (
    <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-md animate-fade-up">
        <div className="rounded-[2rem] border border-warm-200/70 bg-white p-8 shadow-2xl shadow-black/[0.05] md:p-10">
          <div className="mb-8 text-center">
            <p className="mb-3 text-xs font-medium tracking-[0.2em] text-sage-500 uppercase">
              New employee
            </p>
            <h1 className="mb-2 font-serif text-[clamp(1.8rem,5vw,2.4rem)] leading-tight font-bold text-[#1a1a1a]">
              Create your <span className="text-sage-600 italic">account</span>
            </h1>
            <p className="text-[15px] text-warm-700">
              Use the email your admin already added for you
            </p>
          </div>

          {error && (
            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
              <TriangleAlert className="h-5 w-5 shrink-0 text-red-600" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form action={registerEmployee} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-warm-700">
                Work email
              </label>
              <div className="relative">
                <Mail className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-sage-500" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  defaultValue={email}
                  placeholder="you@office.com"
                  className="w-full rounded-2xl border border-warm-200 bg-warm-50 py-3 pr-4 pl-11 text-[#1a1a1a] transition-all outline-none placeholder:text-warm-400 focus:border-sage-400 focus:ring-2 focus:ring-sage-500/30"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-warm-700">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-sage-500" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  placeholder="At least 10 characters"
                  className="w-full rounded-2xl border border-warm-200 bg-warm-50 py-3 pr-4 pl-11 text-[#1a1a1a] transition-all outline-none placeholder:text-warm-400 focus:border-sage-400 focus:ring-2 focus:ring-sage-500/30"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="confirm_password"
                className="mb-2 block text-sm font-medium text-warm-700"
              >
                Confirm password
              </label>
              <div className="relative">
                <Lock className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-sage-500" />
                <input
                  id="confirm_password"
                  name="confirm_password"
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  className="w-full rounded-2xl border border-warm-200 bg-warm-50 py-3 pr-4 pl-11 text-[#1a1a1a] transition-all outline-none placeholder:text-warm-400 focus:border-sage-400 focus:ring-2 focus:ring-sage-500/30"
                />
              </div>
            </div>

            <SubmitButton fullWidth size="lg">
              Create account
              <ArrowRight className="ml-2 h-4 w-4" />
            </SubmitButton>
          </form>

          <p className="mt-6 text-center text-sm text-warm-600">
            Already registered?{" "}
            <Link
              href="/login"
              className="font-semibold text-sage-700 underline underline-offset-4 hover:text-sage-800"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
