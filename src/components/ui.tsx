"use client";

import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TriangleAlert } from "lucide-react";
import type { DayStatus } from "@/attend/types";

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STATUS_STYLES: Record<DayStatus, string> = {
  present: "bg-emerald-50 text-emerald-700",
  late: "bg-amber-50 text-amber-700",
  half_day: "bg-orange-50 text-orange-700",
  absent: "bg-red-50 text-red-700",
  leave: "bg-sky-50 text-sky-700",
  weekend: "bg-warm-100 text-warm-600",
  holiday: "bg-violet-50 text-violet-700",
};

const STATUS_MEANING: Record<DayStatus, string> = {
  present: "Checked in within the shift's grace period.",
  late: "Checked in after the grace period but within the half-day threshold.",
  half_day: "Checked in later than the shift's half-day threshold.",
  absent: "No check-in recorded on a working day.",
  leave: "Approved leave.",
  holiday: "Holiday.",
  weekend: "Weekly off.",
};

export function StatusBadge({ status }: { status: DayStatus }) {
  return (
    <span title={STATUS_MEANING[status]} className="inline-flex">
      <Badge className={cn(STATUS_STYLES[status])}>{status.replace("_", " ")}</Badge>
    </span>
  );
}

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-warm-100 py-2.5 text-sm last:border-0">
      <span className="text-warm-600">{label}</span>
      <span className="font-semibold text-[#1a1a1a]">{value}</span>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" className="mb-4">
      <TriangleAlert />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function ActionError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <Alert variant="destructive" className="mt-2">
      <TriangleAlert />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );
}
