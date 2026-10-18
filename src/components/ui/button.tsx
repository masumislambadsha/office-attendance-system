import * as React from "react"
import {
  buttonVariants as heroButtonVariants,
  Button as HeroButton,
} from "@heroui/react"
import { cn } from "cn"
import { Spinner } from "@/components/ui/spinner"

const VARIANT_MAP = {
  default: "primary",
  outline: "outline",
  secondary: "secondary",
  ghost: "ghost",
  destructive: "danger",
  link: "ghost",
} as const

const SIZE_MAP = {
  default: "md",
  xs: "sm",
  sm: "sm",
  lg: "lg",
} as const

const ICON_CLASSES: Record<string, string | undefined> = {
  icon: undefined,
  "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
  "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-3.5",
  "icon-lg": "size-11",
}

const LINK_CLASSES =
  "bg-transparent text-sage-600 underline underline-offset-4 hover:bg-transparent hover:text-sage-700"

type ButtonVariant = keyof typeof VARIANT_MAP
type ButtonSize = keyof typeof SIZE_MAP | keyof typeof ICON_CLASSES
type HeroButtonProps = React.ComponentProps<typeof HeroButton>

type ButtonProps = Omit<HeroButtonProps, "variant" | "size"> & {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  disabled?: boolean
  /** Shows a spinner, marks the button busy, and blocks interaction while true. */
  loading?: boolean
  className?: string
}

const SPINNER_SIZE_MAP = {
  xs: "xs",
  sm: "xs",
  md: "sm",
  lg: "md",
} as const

function resolveSize(size: ButtonSize, variant: ButtonVariant) {
  const isIcon = size.startsWith("icon")
  const heroSize = isIcon ? ("md" as const) : (SIZE_MAP[size as keyof typeof SIZE_MAP] ?? "md")
  return {
    isIcon,
    heroSize,
    spinnerSize: isIcon ? ("sm" as const) : SPINNER_SIZE_MAP[heroSize],
    extra: cn(
      variant === "link" && LINK_CLASSES,
      size === "xs" && "h-7 px-3 text-xs",
      isIcon && ICON_CLASSES[size]
    ),
  }
}

function Button({
  className,
  variant = "default",
  size = "default",
  fullWidth,
  disabled,
  loading = false,
  children,
  ...props
}: ButtonProps) {
  const { isIcon, heroSize, spinnerSize, extra } = resolveSize(size, variant)
  // HeroUI also types children as a render-function; every call site here passes
  // plain nodes, so narrow it once. Keep idle children a single child (not an
  // array) so React Aria can still derive the accessible name from them.
  const nodes = children as React.ReactNode
  const content = loading
    ? (
        <>
          <Spinner size={spinnerSize} />
          {isIcon ? null : nodes}
        </>
      )
    : nodes
  return (
    <HeroButton
      className={cn(extra, className)}
      variant={VARIANT_MAP[variant]}
      size={heroSize}
      isIconOnly={isIcon || undefined}
      fullWidth={fullWidth}
      isDisabled={loading || disabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {content}
    </HeroButton>
  )
}

function buttonVariants({
  className,
  variant = "default",
  size = "default",
  ...opts
}: ButtonProps): string {
  const { isIcon, heroSize, extra } = resolveSize(size, variant)
  return String(
    heroButtonVariants({
      ...(opts as Record<string, unknown>),
      variant: VARIANT_MAP[variant],
      size: heroSize,
      isIconOnly: isIcon,
      className: cn(extra, className),
    } as unknown as Parameters<typeof heroButtonVariants>[0])
  )
}

export { Button, buttonVariants }
export type { ButtonProps }
