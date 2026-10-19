/**
 * Daily status resolver — the single source of truth for a day's status.
 * Pure, testable module (no imports). All times are minutes since Asia/Dhaka
 * midnight; weekday uses JS convention (0=Sun..6=Sat; BD: 0=Sun, 5=Fri).
 *
 * Resolution priority (strict): manual override > holiday > weekly off >
 * approved leave > half-day leave without a scan > future day (undecided, not
 * absent) > missing check-in (absent) > timing (present/late/half-day).
 */

export type DayStatus =
  | "present"
  | "late"
  | "half_day"
  | "absent"
  | "leave"
  | "weekend"
  | "holiday"
  | "upcoming";

export type OversightFlag = "early_exit" | "missing_checkout" | null;

export interface ShiftTiming {
  startMin: number;
  endMin: number;
  graceMin: number;
  halfDayAfterMin: number;
  earlyExitMin: number;
}

export interface DayInput {
  weekday: number; // 0=Sun..6=Sat
  isHoliday: boolean;
  isWeeklyOff: boolean;
  isApprovedLeave: boolean;
  /** Approved half-day leave; a scan that day still counts for timing. */
  isHalfDayLeave: boolean;
  checkInMin: number | null; // first scan today
  checkOutMin: number | null; // last scan today (if any)
  shift: ShiftTiming | null;
  manualStatus?: DayStatus | null;
  /** The date is after today: the roster is known, the attendance is not. */
  isFuture?: boolean;
}

export interface DayOutput {
  status: DayStatus;
  lateMin: number;
  flag: OversightFlag;
}

/** A shift that wraps past midnight (end time is earlier than start time on the clock). */
export function isOvernightShift(startMin: number, endMin: number): boolean {
  return endMin < startMin;
}

/**
 * End of the shift in minutes measured from the shift-start day's midnight.
 * Overnight shifts (e.g. 22:00->06:00) land past 24:00 (1320 -> 1800).
 */
export function wrappedEndMin(startMin: number, endMin: number): number {
  return isOvernightShift(startMin, endMin) ? endMin + 24 * 60 : endMin;
}

/**
 * A scan's minute aligned to the shift-start day's midnight. For overnight
 * shifts, scans before the midpoint between shift end and the next shift start
 * (e.g. a 06:00 checkout) are advanced onto the following day, while evening
 * arrivals from the midpoint onward stay on their own day.
 */
export function anchorShiftMinute(
  startMin: number,
  endMin: number,
  overnight: boolean,
  timeOfDay: number,
): number {
  const cutoff = endMin + (startMin - endMin) / 2;
  return overnight && timeOfDay < cutoff ? timeOfDay + 24 * 60 : timeOfDay;
}

export function resolveDayStatus(input: DayInput): DayOutput {
  if (input.manualStatus) {
    return { status: input.manualStatus, lateMin: 0, flag: null };
  }
  if (input.isHoliday) return { status: "holiday", lateMin: 0, flag: null };
  if (input.isWeeklyOff) return { status: "weekend", lateMin: 0, flag: null };
  if (input.isApprovedLeave) return { status: "leave", lateMin: 0, flag: null };
  if (input.isHalfDayLeave && input.checkInMin === null) {
    return { status: "leave", lateMin: 0, flag: null };
  }

  // The day has not happened yet, so there is no attendance to judge. Holidays,
  // weekly off and booked leave above are already known, so they still show as
  // such; everything else is simply undecided — never an absence.
  if (input.isFuture) {
    return { status: "upcoming", lateMin: 0, flag: null };
  }

  if (input.checkInMin === null) {
    return { status: "absent", lateMin: 0, flag: null };
  }

  if (!input.shift) {
    return { status: "absent", lateMin: 0, flag: null };
  }

  const diff = input.checkInMin - input.shift.startMin;
  let status: DayStatus;
  let lateMin = 0;
  if (diff <= input.shift.graceMin) {
    status = "present";
  } else if (diff <= input.shift.halfDayAfterMin) {
    status = "late";
    lateMin = diff;
  } else {
    status = "half_day";
    lateMin = diff;
  }

  let flag: OversightFlag = null;
  if (input.checkOutMin !== null) {
    if (input.checkOutMin < input.shift.endMin - input.shift.earlyExitMin) {
      flag = "early_exit";
    }
  } else {
    flag = "missing_checkout";
  }

  return { status, lateMin, flag };
}
