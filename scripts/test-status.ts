// Runs with: node scripts/test-status.ts (Node 20.11+ type stripping)
// Covers §15 acceptance tests #1/#2/#3 logic at the pure-function level.
import {
  anchorShiftMinute,
  isOvernightShift,
  resolveDayStatus,
  wrappedEndMin,
} from "../src/attend/status.ts";
import type { DayInput, ShiftTiming } from "../src/attend/status.ts";
import { overnightCutoff, workingDateForScan } from "../src/lib/time.ts";

// Shift 9:00-18:00, grace 10, half-day threshold 60, early-exit 60 (before 17:00)
const shift: ShiftTiming = { startMin: 9 * 60, endMin: 18 * 60, graceMin: 10, halfDayAfterMin: 60, earlyExitMin: 60 };

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.error(`FAIL ${name}\n     got  ${g}\n     want ${w}`);
  }
}

function day(over: Partial<DayInput> = {}): DayInput {
  return {
    weekday: 1,
    isHoliday: false,
    isWeeklyOff: false,
    isApprovedLeave: false,
    isHalfDayLeave: false,
    checkInMin: null,
    checkOutMin: null,
    shift,
    ...over,
  };
}

console.log("§15 #1 — status engine boundaries");
eq("present at 9:00", resolveDayStatus(day({ checkInMin: 9 * 60, checkOutMin: 18 * 60 })).status, "present");
eq("present at grace (9:10)", resolveDayStatus(day({ checkInMin: 9 * 60 + 10, checkOutMin: 18 * 60 })).status, "present");
eq("late at grace+1 (9:11)", resolveDayStatus(day({ checkInMin: 9 * 60 + 11, checkOutMin: 18 * 60 })).status, "late");
eq("late at 9:59", resolveDayStatus(day({ checkInMin: 9 * 60 + 59, checkOutMin: 18 * 60 })).status, "late");
eq("late_min = 59", resolveDayStatus(day({ checkInMin: 9 * 60 + 59, checkOutMin: 18 * 60 })).lateMin, 59);
eq("half-day at threshold+1 (10:01)", resolveDayStatus(day({ checkInMin: 9 * 60 + 61, checkOutMin: 18 * 60 })).status, "half_day");
eq("absent when no scan", resolveDayStatus(day()).status, "absent");

console.log("§5 — priority (holiday > weekend > leave > absence)");
eq("holiday beats weekend", resolveDayStatus(day({ weekday: 5, isHoliday: true, isWeeklyOff: true, checkInMin: 9 * 60 })).status, "holiday");
eq("weekend beats leave", resolveDayStatus(day({ weekday: 5, isWeeklyOff: true, isApprovedLeave: true })).status, "weekend");
eq("leave beats absence", resolveDayStatus(day({ isApprovedLeave: true })).status, "leave");
eq("scan on holiday keeps holiday", resolveDayStatus(day({ isHoliday: true, checkInMin: 9 * 60, checkOutMin: 18 * 60 })).status, "holiday");
eq("scan on weekend keeps weekend", resolveDayStatus(day({ weekday: 5, isWeeklyOff: true, checkInMin: 9 * 60, checkOutMin: 18 * 60 })).status, "weekend");

console.log("§4 — check-out flags");
eq("early-exit flagged before end-60", resolveDayStatus(day({ checkInMin: 9 * 60, checkOutMin: 17 * 60 - 1 })).flag, "early_exit");
eq("normal checkout no flag", resolveDayStatus(day({ checkInMin: 9 * 60, checkOutMin: 17 * 60 })).flag, null);
eq("missing checkout flagged", resolveDayStatus(day({ checkInMin: 9 * 60 })).flag, "missing_checkout");

console.log("§5 — override behaviour with shift override (Ramadan 9:00-15:00)");
const ramadanShift = { ...shift, endMin: 15 * 60 };
eq("early exit vs 15:00 end not flagged at 14:30", resolveDayStatus(day({ checkInMin: 9 * 60, checkOutMin: 14 * 60 + 30, shift: ramadanShift })).flag, null);
eq("manual override wins", resolveDayStatus(day({ checkInMin: 9 * 60, checkOutMin: 18 * 60, manualStatus: "absent" })).status, "absent");

console.log("§5 — half-day leave");
eq("half-day leave with no scan -> leave", resolveDayStatus(day({ isHalfDayLeave: true })).status, "leave");
eq("half-day leave with on-time scan -> present", resolveDayStatus(day({ isHalfDayLeave: true, checkInMin: 9 * 60, checkOutMin: 18 * 60 })).status, "present");
eq("half-day leave with late scan -> late", resolveDayStatus(day({ isHalfDayLeave: true, checkInMin: 9 * 60 + 30, checkOutMin: 18 * 60 })).status, "late");
eq("full-day leave beats half-day leave", resolveDayStatus(day({ isApprovedLeave: true, isHalfDayLeave: true })).status, "leave");
eq("holiday beats half-day leave", resolveDayStatus(day({ isHoliday: true, isHalfDayLeave: true })).status, "holiday");
eq("weekend beats half-day leave", resolveDayStatus(day({ weekday: 5, isWeeklyOff: true, isHalfDayLeave: true })).status, "weekend");
eq("manual beats half-day leave", resolveDayStatus(day({ isHalfDayLeave: true, manualStatus: "present" })).status, "present");

console.log("§5 — future days are undecided, never absent");
eq("future working day with no scan -> upcoming", resolveDayStatus(day({ isFuture: true })).status, "upcoming");
eq("future day lateMin is 0", resolveDayStatus(day({ isFuture: true })).lateMin, 0);
eq("future day has no flag", resolveDayStatus(day({ isFuture: true })).flag, null);
eq("future holiday stays holiday", resolveDayStatus(day({ isFuture: true, isHoliday: true })).status, "holiday");
eq("future weekly off stays weekend", resolveDayStatus(day({ isFuture: true, weekday: 5, isWeeklyOff: true })).status, "weekend");
eq("future approved leave stays leave", resolveDayStatus(day({ isFuture: true, isApprovedLeave: true })).status, "leave");
eq("future half-day leave without scan stays leave", resolveDayStatus(day({ isFuture: true, isHalfDayLeave: true })).status, "leave");
eq("future day with manual override wins", resolveDayStatus(day({ isFuture: true, manualStatus: "present" })).status, "present");
eq("past day with no scan is still absent", resolveDayStatus(day()).status, "absent");

console.log("§5 — night shift (22:00->06:00) helpers + status");
eq("22:00->06:00 detected as overnight", isOvernightShift(22 * 60, 6 * 60), true);
eq("09:00->18:00 not overnight", isOvernightShift(9 * 60, 18 * 60), false);
eq("wrapped end = 1800", wrappedEndMin(22 * 60, 6 * 60), 6 * 60 + 24 * 60);
eq("overnight cutoff = 14:00 (840)", overnightCutoff(22 * 60, 6 * 60), 14 * 60);
eq("next-morning 06:05 anchors to 1805", anchorShiftMinute(22 * 60, 6 * 60, true, 6 * 60 + 5), 6 * 60 + 24 * 60 + 5);
eq("same-evening 22:05 anchors to 1325", anchorShiftMinute(22 * 60, 6 * 60, true, 22 * 60 + 5), 22 * 60 + 5);
eq("pre-shift 21:50 stays on its own day (1310)", anchorShiftMinute(22 * 60, 6 * 60, true, 21 * 60 + 50), 21 * 60 + 50);
eq("13:00 before cutoff anchors to previous day (2220)", anchorShiftMinute(22 * 60, 6 * 60, true, 13 * 60), 13 * 60 + 24 * 60);
eq("15:00 after cutoff stays on its own day (900)", anchorShiftMinute(22 * 60, 6 * 60, true, 15 * 60), 15 * 60);
eq("day-shift 08:20 never anchored", anchorShiftMinute(9 * 60, 18 * 60, false, 8 * 60 + 20), 8 * 60 + 20);
const nightShift: ShiftTiming = { startMin: 22 * 60, endMin: 6 * 60 + 24 * 60, graceMin: 10, halfDayAfterMin: 60, earlyExitMin: 60 };
eq("night on-time in+out present", resolveDayStatus(day({ shift: nightShift, checkInMin: 22 * 60, checkOutMin: 6 * 60 + 24 * 60 })).status, "present");
eq("night on-time checkout no flag", resolveDayStatus(day({ shift: nightShift, checkInMin: 22 * 60, checkOutMin: 6 * 60 + 24 * 60 })).flag, null);
eq("night late after grace (22:30)", resolveDayStatus(day({ shift: nightShift, checkInMin: 22 * 60 + 30, checkOutMin: 6 * 60 + 24 * 60 })).status, "late");
eq("night early-exit at 04:30", resolveDayStatus(day({ shift: nightShift, checkInMin: 22 * 60, checkOutMin: 4 * 60 + 30 + 24 * 60 })).flag, "early_exit");
eq("night missing checkout when no scan out", resolveDayStatus(day({ shift: nightShift, checkInMin: 22 * 60 })).flag, "missing_checkout");

console.log("§4 — scan-to-working-date attribution (overnight cutoff)");
// Dhaka is UTC+6, so 15:50Z = 21:50 Dhaka on 2026-01-05.
eq("21:50 scan -> that evening's shift (same day)", workingDateForScan(22 * 60, 6 * 60, true, new Date("2026-01-05T15:50:00Z")), "2026-01-05");
eq("06:00 next-morning scan -> previous day", workingDateForScan(22 * 60, 6 * 60, true, new Date("2026-01-06T00:00:00Z")), "2026-01-05");
eq("06:05 next-morning scan -> previous day", workingDateForScan(22 * 60, 6 * 60, true, new Date("2026-01-06T00:05:00Z")), "2026-01-05");
eq("13:00 scan (before cutoff) -> previous day", workingDateForScan(22 * 60, 6 * 60, true, new Date("2026-01-06T07:00:00Z")), "2026-01-05");
eq("15:00 scan (after cutoff) -> new day", workingDateForScan(22 * 60, 6 * 60, true, new Date("2026-01-06T09:00:00Z")), "2026-01-06");
eq("day-shift scan keeps its calendar date", workingDateForScan(9 * 60, 18 * 60, false, new Date("2026-01-06T07:00:00Z")), "2026-01-06");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
