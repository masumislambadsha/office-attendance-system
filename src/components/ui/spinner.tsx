import { Loader2Icon } from "lucide-react";
import { cn } from "cn";

const SPINNER_SIZES = {
  xs: "size-3",
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
} as const;

type SpinnerSize = keyof typeof SPINNER_SIZES;

function Spinner({
  size = "sm",
  className,
  label,
}: {
  size?: SpinnerSize;
  className?: string;
  /** Pass a string to announce the busy state to screen readers; omit to stay hidden. */
  label?: string;
}) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0 animate-spin", SPINNER_SIZES[size], className)}
    />
  );
}

export { Spinner };