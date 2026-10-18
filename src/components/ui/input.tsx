import * as React from "react"
import { Input as HeroInput, TextField } from "@heroui/react"
import { cn } from "cn"

type InputProps = React.ComponentProps<"input">

/**
 * HeroUI text input. Renders a real <input> so `name`, `required` and native
 * constraint validation keep working inside <form action={serverAction}>.
 * RAC's TextField owns the field state, so `value`/`defaultValue` must go on
 * the TextField — passing `defaultValue` to the inner input collides with the
 * `value` it derives from state (native input renders empty).
 */
function Input({ className, type, defaultValue, value, ...props }: InputProps) {
  return (
    <TextField
      fullWidth
      {...(defaultValue !== undefined ? { defaultValue: defaultValue as string } : {})}
      {...(value !== undefined ? { value: value as string } : {})}
    >
      <HeroInput
        type={type}
        data-slot="input"
        className={cn("w-full", className)}
        {...props}
      />
    </TextField>
  )
}

export { Input }
