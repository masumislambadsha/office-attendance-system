import { FormSkeleton, HeadingSkeleton, TableSkeleton } from "@/components/loading";

export default function AdminLoading() {
  return (
    <div aria-busy="true">
      <HeadingSkeleton />
      <div className="mt-4">
        <FormSkeleton />
      </div>
      <div className="mt-4">
        <TableSkeleton />
      </div>
    </div>
  );
}
