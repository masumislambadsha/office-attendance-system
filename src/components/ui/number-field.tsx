"use client"

import * as React from "react"
import { NumberField as HeroNumberField } from "@heroui/react"
import { cn } from "cn"

type NumberFieldFieldProps = {
  name: string
  defaultValue?: number | string
  value?: number | string
  onValueChange?: (value: string) => void
  minValue?: number
  maxValue?: number
  step?: number | "any"
  placeholder?: string
  ariaLabel?: string
  labelledBy?: string
  isRequired?: boolean
  isDisabled?: boolean
  className?: string
}

function toNumber(raw: number | string | undefined): number | null {
  if (raw === undefined || raw === "") return null
  const parsed = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * HeroUI NumberField mirrored into a hidden `name` field so plain
 * <form action={serverAction}> submissions keep working unchanged.
 */
export function NumberFieldField({
  name,
  defaultValue,
  value,
  onValueChange,
  minValue,
  maxValue,
  step,
  placeholder,
  ariaLabel,
  labelledBy,
  isRequired,
  isDisabled,
  className,
}: NumberFieldFieldProps) {
  const [inner, setInner] = React.useState<number | null>(() => toNumber(defaultValue))
  const isControlled = value !== undefined
  const current = isControlled ? toNumber(value) : inner

  const handleChange = React.useCallback(
    (next: number | null) => {
      if (!isControlled) setInner(next)
      onValueChange?.(next === null ? "" : String(next))
    },
    [isControlled, onValueChange]
  )

  return (
    <>
      <input type="hidden" name={name} value={current === null ? "" : current} />
      <HeroNumberField
        {...(isControlled ? { value: current ?? undefined } : { defaultValue: current ?? undefined })}
        onChange={handleChange}
        minValue={minValue}
        maxValue={maxValue}
        step={step as number | undefined}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        isRequired={isRequired}
        isDisabled={isDisabled}
        className={cn("w-full", className)}
      >
        <HeroNumberField.Group className="w-full">
          <HeroNumberField.Input className="w-full p-0 pl-2" placeholder={placeholder} />
          <HeroNumberField.IncrementButton>&#43;</HeroNumberField.IncrementButton>
          <HeroNumberField.DecrementButton>&#8722;</HeroNumberField.DecrementButton>
        </HeroNumberField.Group>
      </HeroNumberField>
    </>
  )
}
