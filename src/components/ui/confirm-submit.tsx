"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

type Props = {
  message: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
};

/**
 * Destructive submit button for server-action forms. Asks for confirmation
 * before the form posts, and disables itself while the action is running.
 * Native button so form submission and confirm() behave predictably.
 */
export function ConfirmSubmit({ message, children, className, disabled }: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50",
        className,
      )}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
