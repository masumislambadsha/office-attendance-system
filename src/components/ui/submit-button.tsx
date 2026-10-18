"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Submit button for `<form action={serverAction}>` forms. Reads the enclosing
 * form's status, so it shows the spinner and blocks a second submit while the
 * action is in flight. Must be rendered inside the form it submits.
 */
export function SubmitButton({ disabled, loading, children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      loading={loading ?? pending}
      disabled={disabled || pending}
      {...props}
    >
      {children}
    </Button>
  );
}