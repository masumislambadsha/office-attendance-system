"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Clock,
  Smartphone,
  Inbox,
  Lock,
  Table2,
  ScanLine,
  LogOut,
  Menu,
  History,
  Building2,
  QrCode,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { Spinner } from "@/components/ui/spinner";

type NavItem = {
  icon: LucideIcon;
  label: string;
  href: string;
};

const EMPLOYEE_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: "My attendance", href: "/me" },
  { icon: History, label: "History", href: "/me/history" },
  { icon: CalendarDays, label: "Leave", href: "/me/leave" },
  { icon: ScanLine, label: "Scanner", href: "/scan" },
];

const ADMIN_NAV: NavItem[] = [
  { icon: LayoutDashboard, label: "Today", href: "/admin" },
  { icon: Users, label: "Employees", href: "/admin/employees" },
  { icon: Clock, label: "Shifts", href: "/admin/shifts" },
  { icon: CalendarDays, label: "Holidays", href: "/admin/holidays" },
  { icon: Smartphone, label: "Devices", href: "/admin/devices" },
  { icon: QrCode, label: "Office QR", href: "/admin/qr" },
  { icon: Inbox, label: "Leaves", href: "/admin/leaves" },
  { icon: Lock, label: "Monthly close", href: "/admin/close" },
  { icon: Table2, label: "Monthly sheet", href: "/admin/sheet" },
];

export interface ShellUser {
  name?: string | null;
  email: string;
  role?: string | null;
}

export function DashboardShell({
  variant,
  user,
  children,
}: {
  variant: "employee" | "admin";
  user: ShellUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    // Intentional mount gate: avoids hydration mismatch on sidebar state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    if (window.innerWidth >= 1024) setOpen(true);
  }, []);

  const items = variant === "admin" ? ADMIN_NAV : EMPLOYEE_NAV;
  const initial = (user.name ?? user.email).charAt(0).toUpperCase();

  const signOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
    } finally {
      router.push("/login");
    }
  };

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-warm-50">
<div className="flex flex-col items-center gap-4">
            <Spinner size="lg" className="text-sage-600" label="Loading" />
            <p className="text-sm font-medium text-warm-700">Loading...</p>
          </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-warm-50">
      {open && (
        <div
          className="fixed inset-0 z-30 bg-[#1a1a1a]/60 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 z-40 flex h-full flex-col border-r border-white/5 bg-[#1a1a1a] transition-all duration-300",
          open ? "w-64 translate-x-0" : "-translate-x-full lg:w-20 lg:translate-x-0",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
          {open ? (
            <Link href="/" className="group flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sage-600 transition-colors group-hover:bg-sage-500">
                <Building2 className="h-4 w-4 text-white" />
              </span>
              <span className="font-serif text-lg font-bold tracking-tight text-warm-50">
                Attend<span className="text-sage-500">ance</span>
              </span>
            </Link>
          ) : (
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-sage-600">
              <Building2 className="h-4 w-4 text-white" />
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map((item) => {
            const active =
              item.href === "/me" || item.href === "/admin"
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (window.innerWidth < 1024) setOpen(false);
                }}
                title={!open ? item.label : ""}
                className={cn(
                  "flex items-center gap-3 rounded-xl transition-all duration-200",
                  open ? "mx-1 px-4 py-2.5" : "justify-center px-0 py-2.5",
                  active
                    ? "bg-sage-600 text-white shadow-lg shadow-sage-600/25"
                    : "text-warm-300 hover:bg-white/5 hover:text-warm-50",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {open && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 space-y-2 border-t border-white/10 p-3">
          <div className={cn("flex items-center gap-3 px-2", !open && "justify-center")}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-600 font-bold text-white ring-2 ring-sage-500/30">
              {initial}
            </div>
            {open && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {user.name ?? user.email}
                </p>
                <p className="text-xs tracking-wider text-warm-300 uppercase">
                  {user.role ?? "staff"}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={() => void signOut()}
            disabled={signingOut}
            aria-busy={signingOut || undefined}
            title={!open ? "Sign out" : ""}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-warm-300 transition-all hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60",
              !open && "justify-center",
            )}
          >
            {signingOut ? (
              <Spinner size="sm" className="shrink-0" />
            ) : (
              <LogOut className="h-5 w-5 shrink-0" />
            )}
            {open && <span className="text-sm font-medium">{signingOut ? "Signing out…" : "Sign out"}</span>}
          </button>
        </div>
      </aside>

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-all duration-300",
          open ? "lg:ml-64" : "lg:ml-20",
        )}
      >
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-warm-100 bg-white/80 px-4 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen((o) => !o)}
              className="rounded-xl p-2 transition-colors hover:bg-warm-100"
              aria-label="Toggle sidebar"
            >
              <Menu className="h-5 w-5 text-[#1a1a1a]" />
            </button>
            <span className="hidden font-serif text-lg font-bold tracking-tight text-[#1a1a1a] sm:inline">
              {variant === "admin" ? "Admin console" : "My workspace"}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-2 rounded-full bg-warm-100 py-1.5 pr-4 pl-1.5 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sage-600 text-sm font-bold text-white ring-2 ring-sage-500/30">
                {initial}
              </span>
              <span className="max-w-[10rem] truncate text-sm font-semibold text-[#1a1a1a]">
                {user.name ?? user.email}
              </span>
            </span>
            <button
              onClick={() => void signOut()}
              disabled={signingOut}
              aria-busy={signingOut || undefined}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-warm-100 px-4 py-2 text-sm font-medium text-warm-700 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signingOut ? <Spinner size="sm" /> : <LogOut className="h-4 w-4" />}
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-3 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
