import {
  FormSkeleton,
  HeadingSkeleton,
  Skeleton,
  TableSkeleton,
} from "@/components/loading";

export default function MeLoading() {
  return (
    <div aria-busy="true">
      <HeadingSkeleton />
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-warm-100 bg-white p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="mt-4">
        <TableSkeleton rows={5} columns={4} />
      </div>
      <div className="mt-4">
        <FormSkeleton fields={4} />
      </div>
    </div>
  );
}