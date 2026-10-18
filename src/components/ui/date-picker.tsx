"use client"

import * as React from "react"
import {
  Calendar,
  DateField,
  DatePicker as HeroDatePicker,
  DateRangePicker as HeroDateRangePicker,
  I18nProvider,
  RangeCalendar,
} from "@heroui/react"
import { parseDate, type CalendarDate, type DateValue } from "@internationalized/date"
import type { DateRange } from "react-stately/useDateRangePickerState"
import { cn } from "cn"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function toDateValue(value: string | null | undefined): DateValue | null {
  if (!value || !ISO_DATE.test(value)) return null
  try {
    return parseDate(value)
  } catch {
    return null
  }
}

function toRangeValue(from: string | undefined, to: string | undefined): DateRange | null {
  const start = toDateValue(from)
  if (!start) return null
  return { start, end: toDateValue(to) ?? start }
}

function fromRange(range: DateRange | null): { from: string; to: string } {
  if (!range?.start) return { from: "", to: "" }
  return { from: range.start.toString(), to: (range.end ?? range.start).toString() }
}

type DateRangePickerFieldProps = {
  /** Hidden input name for the range start. */
  name: string
  /** Hidden input name for the range end. Defaults to `${name}_to`. */
  endName?: string
  defaultFrom?: string
  defaultTo?: string
  valueFrom?: string
  valueTo?: string
  onRangeChange?: (from: string, to: string) => void
  minValue?: string
  ariaLabel?: string
  labelledBy?: string
  isRequired?: boolean
  className?: string
}

/**
 * HeroUI DateRangePicker mirrored into two hidden inputs so plain
 * <form action={serverAction}> submissions keep working. Picking a single date
 * leaves the end equal to the start.
 */
export function DateRangePickerField({
  name,
  endName,
  defaultFrom,
  defaultTo,
  valueFrom,
  valueTo,
  onRangeChange,
  minValue,
  ariaLabel,
  labelledBy,
  isRequired,
  className,
}: DateRangePickerFieldProps) {
  const [inner, setInner] = React.useState<DateRange | null>(() => toRangeValue(defaultFrom, defaultTo))
  const isControlled = valueFrom !== undefined
  const current = isControlled ? toRangeValue(valueFrom, valueTo) : inner

  const handleChange = React.useCallback(
    (next: DateRange | null) => {
      if (!isControlled) setInner(next)
      const { from, to } = fromRange(next)
      onRangeChange?.(from, to)
    },
    [isControlled, onRangeChange]
  )

  const { from, to } = fromRange(current)

  return (
    <>
      <input type="hidden" name={name} value={from} />
      <input type="hidden" name={endName ?? `${name}_to`} value={to} />
      <I18nProvider locale="en-GB">
        <HeroDateRangePicker
          {...(isControlled ? { value: current ?? null } : { defaultValue: current ?? null })}
          onChange={handleChange}
          minValue={toDateValue(minValue) ?? undefined}
          isRequired={isRequired}
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          className={cn("w-full", className)}
        >
          <HeroDateRangePicker.Trigger className="w-full justify-start font-normal">
            <DateField.Group className="w-full flex-1">
              <DateField.InputContainer>
                <DateField.Input slot="start">
                  {(segment) => <DateField.Segment segment={segment} />}
                </DateField.Input>
              </DateField.InputContainer>
              <HeroDateRangePicker.RangeSeparator />
              <DateField.InputContainer>
                <DateField.Input slot="end">
                  {(segment) => <DateField.Segment segment={segment} />}
                </DateField.Input>
              </DateField.InputContainer>
            </DateField.Group>
            <HeroDateRangePicker.TriggerIndicator />
          </HeroDateRangePicker.Trigger>
          <HeroDateRangePicker.Popover>
            <RangeCalendar>
              <RangeCalendar.Header>
                <RangeCalendar.NavButton slot="previous">&#8249;</RangeCalendar.NavButton>
                <RangeCalendar.Heading />
                <RangeCalendar.NavButton slot="next">&#8250;</RangeCalendar.NavButton>
              </RangeCalendar.Header>
              <RangeCalendar.Grid>
                <RangeCalendar.GridHeader>
                  {(day: string) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
                </RangeCalendar.GridHeader>
                <RangeCalendar.GridBody>
                  {(date: CalendarDate) => <RangeCalendar.Cell date={date} />}
                </RangeCalendar.GridBody>
              </RangeCalendar.Grid>
            </RangeCalendar>
          </HeroDateRangePicker.Popover>
        </HeroDateRangePicker>
      </I18nProvider>
    </>
  )
}

type DatePickerFieldProps = {
  name: string
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  minValue?: string
  ariaLabel?: string
  labelledBy?: string
  isRequired?: boolean
  className?: string
}

/**
 * HeroUI DatePicker (segmented input + calendar popover) mirrored into a hidden
 * `name` field so plain <form action={serverAction}> submissions keep working.
 */
export function DatePickerField({
  name,
  defaultValue,
  value,
  onValueChange,
  minValue,
  ariaLabel,
  labelledBy,
  isRequired,
  className,
}: DatePickerFieldProps) {
  const [inner, setInner] = React.useState<DateValue | null>(() => toDateValue(defaultValue))
  const isControlled = value !== undefined
  const current = isControlled ? toDateValue(value) : inner

  const handleChange = React.useCallback(
    (next: DateValue | null) => {
      if (!isControlled) setInner(next)
      onValueChange?.(next ? next.toString() : "")
    },
    [isControlled, onValueChange]
  )

  return (
    <>
      <input type="hidden" name={name} value={current ? current.toString() : ""} />
      <I18nProvider locale="en-GB">
        <HeroDatePicker
          {...(isControlled ? { value: current ?? undefined } : { defaultValue: current ?? undefined })}
          onChange={handleChange}
          minValue={toDateValue(minValue) ?? undefined}
          isRequired={isRequired}
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          className={cn("w-full", className)}
        >
          <HeroDatePicker.Trigger className="w-full justify-start font-normal">
            <DateField.Group className="w-full flex-1">
              <DateField.InputContainer>
                <DateField.Input>
                  {(segment) => <DateField.Segment segment={segment} />}
                </DateField.Input>
              </DateField.InputContainer>
            </DateField.Group>
            <HeroDatePicker.TriggerIndicator />
          </HeroDatePicker.Trigger>
          <HeroDatePicker.Popover>
            <Calendar>
              <Calendar.Header>
                <Calendar.NavButton slot="previous">&#8249;</Calendar.NavButton>
                <Calendar.Heading />
                <Calendar.NavButton slot="next">&#8250;</Calendar.NavButton>
              </Calendar.Header>
              <Calendar.Grid>
                <Calendar.GridHeader>
                  {(day: string) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                </Calendar.GridHeader>
                <Calendar.GridBody>
                  {(date: CalendarDate) => <Calendar.Cell date={date} />}
                </Calendar.GridBody>
              </Calendar.Grid>
            </Calendar>
          </HeroDatePicker.Popover>
        </HeroDatePicker>
      </I18nProvider>
    </>
  )
}
