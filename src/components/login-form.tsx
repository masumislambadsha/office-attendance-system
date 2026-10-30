"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Lock, Mail, Sparkles, TriangleAlert } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

// Dev-only one-click login (the server hides this block in production). The
// credentials live in the environment so a real password never enters git.
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "demo.admin@demo.com";
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "demo123456";

export default function LoginForm({ googleEnabled, demoEnabled }: { googleEnabled: boolean; demoEnabled: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState<"form" | "google" | "demo" | null>(null);
  const busy = pending !== null;
  const [error, setError] = useState<string | null>(null);

  const signInWith = async (source: "form" | "demo", em: string, pw: string) => {
    const address = em.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      setError("Enter a valid email.");
      return;
    }
    if (!pw) {
      setError("Enter your password.");
      return;
    }
    setPending(source);
    setError(null);
    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address, password: pw, rememberMe: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((body?.message as string) || "Invalid email or password.");
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(null);
    }
  };

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    await signInWith("form", email, password);
  };

  const signInGoogle = async () => {
    setPending("google");
    setError(null);
    try {
      const res = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: "/" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((body?.message as string) || "Google sign-in failed.");
      }
      if (body?.url) {
        window.location.href = body.url;
        return;
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(null);
    }
  };

  return (
    <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-md animate-fade-up">
        <div className="rounded-[2rem] border border-warm-200/70 bg-white p-8 shadow-2xl shadow-black/[0.05] md:p-10">
          <div className="mb-8 text-center">
            <p className="mb-3 text-xs font-medium tracking-[0.2em] text-sage-500 uppercase">
              Welcome back
            </p>
            <h1 className="mb-2 font-serif text-[clamp(1.8rem,5vw,2.4rem)] leading-tight font-bold text-[#1a1a1a]">
              Sign in to <span className="text-sage-600 italic">Attendance</span>
            </h1>
            <p className="text-[15px] text-warm-700">Access your office account</p>
          </div>

          {error && (
            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
              <TriangleAlert className="h-5 w-5 shrink-0 text-red-600" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={signIn} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-warm-700">
                Work email
              </label>
              <div className="relative">
                <Mail className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-sage-500" />
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-2xl border border-warm-200 bg-warm-50 py-3 pr-12 pl-11 text-[#1a1a1a] transition-all outline-none placeholder:text-warm-400 focus:border-sage-400 focus:ring-2 focus:ring-sage-500/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute top-1/2 right-4 -translate-y-1/2 text-warm-400 transition-colors hover:text-sage-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="group relative inline-flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-full bg-[#1a1a1a] px-6 py-3.5 text-sm font-medium text-warm-50 transition-all duration-300 hover:bg-[#2a2a2a] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-sage-400/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              {pending === "form" && <Spinner size="sm" className="mr-2" />}
              {pending === "form" ? "Signing in…" : "Sign In"}
              {!busy && <ArrowRight className="ml-2 h-4 w-4" />}
            </button>
          </form>

          {googleEnabled && (
            <div className="mt-7">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-warm-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-4 text-warm-500">Or continue with</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void signInGoogle()}
                disabled={busy}
                aria-busy={pending === "google" || undefined}
                className="mt-6 inline-flex w-full cursor-pointer items-center justify-center gap-3 rounded-full border-2 border-warm-200 bg-white py-3 font-medium text-[#1a1a1a] transition-all duration-300 hover:border-sage-300 active:scale-[0.98] disabled:opacity-50"
              >
                {pending === "google" ? (
                  <Spinner size="sm" className="text-sage-600" />
                ) : (
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                )}
                Continue with Google
              </button>
            </div>
          )}

          {demoEnabled && (
            <div className="mt-7 rounded-2xl border border-warm-200 bg-warm-50 p-5">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-sage-600" />
                <p className="text-sm font-semibold text-[#1a1a1a]">Try the demo account</p>
              </div>
              <p className="mb-4 text-xs text-warm-700">One click to sign in as demo admin.</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void signInWith("demo", DEMO_EMAIL, DEMO_PASSWORD)}
                aria-busy={pending === "demo" || undefined}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-sage-600 px-5 py-2.5 text-xs font-semibold text-white transition-all duration-300 hover:bg-sage-700 active:scale-[0.98] disabled:opacity-50"
              >
                {pending === "demo" && <Spinner size="sm" />}
                Sign in as {DEMO_EMAIL}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
