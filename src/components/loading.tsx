import { cn } from "cn";
import { Spinner } from "@/components/ui/spinner";

/** Pulsing placeholder block. Use for content whose final shape is known. */
function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-warm-100", className)} />;
}

/** Centered spinner for waits of unknown length (auth, kiosk, full-page). */
function PageSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <Spinner size="lg" className="text-sage-600" label={label} />
      <p className="text-sm font-medium text-muted-foreground">Loading…</p>
    </div>
  );
}

/** Skeleton for a page heading: a title bar plus a subtitle bar. */
function HeadingSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80" />
    </div>
  );
}

/** Skeleton for a card holding a form: heading bar plus a two-column field grid. */
function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="rounded-2xl border border-warm-100 bg-white p-6">
      <Skeleton className="h-5 w-40" />
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-5 h-9 w-32" />
    </div>
  );
}

/** Skeleton for a data table: header row plus `rows` body rows. */
function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-warm-100 bg-white">
      <div className="flex gap-4 border-b border-warm-100 bg-warm-50 px-4 py-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 border-b border-warm-50 px-4 py-4 last:border-0">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export { Skeleton, PageSpinner, HeadingSkeleton, FormSkeleton, TableSkeleton };