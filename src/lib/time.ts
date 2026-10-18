/**
 * Asia/Dhaka wall-clock helpers. Leaf module — no imports (kept runnable under
 * plain Node type-stripping so the status engine can be unit-tested).
 *
 * Bangladesh has no DST, so the offset is constant; date-key arithmetic is
 * naive yyyy-MM-dd arithmetic, which is safe here.
 */

export const TZ = "Asia/Dhaka";

const MIN = 60_000;

/** yyyy-MM-dd wall-clock date key in the given IANA zone. */
export function dateKeyInZone(date: Date, timeZone = TZ): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

/** Minutes since zone-midnight for a given instant. */
export function minutesOfDay(date: Date, timeZone = TZ): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const [hour, minute] = fmt
    .format(date)
    .match(/\d{1,2}/g)!
    .map(Number);
  return ((hour % 24) * 60 + minute);
}

/** ISO (UTC) instant for a zone midnight of a yyyy-MM-dd key. */
export function zoneMidnightUtc(dateKey: string, timeZone = TZ): Date {
  const parts = dateKey.split("-").map(Number);
  const y = parts[0];
  const m = parts[1] - 1;
  const d = parts[2];
  const guess = new Date(Date.UTC(y, m, d, 12, 0, 0));
  const offsetMin = offsetAt(guess, timeZone);
  return new Date(Date.UTC(y, m, d, 0, 0, 0) - offsetMin * MIN);
}

function offsetAt(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const toNum = (n: string) => Number(n);
  const vals: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") vals[p.type] = toNum(p.value);
  const asUTC = Date.UTC(vals.year, vals.month - 1, vals.day, vals.hour % 24, vals.minute, vals.second);
  return Math.round((asUTC - date.getTime()) / MIN);
}

/** "hh:mm" (24h, Dhaka) -> minutes since midnight. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** minutes since midnight -> "hh:mm", clamped to a day. */
export function minutesToHhmm(min: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, min));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** yyyy-MM-dd + n days (naive calendar arithmetic; safe without DST). */
export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** Diff in days: (laterKey - earlierKey). */
export function diffDays(earlier: string, later: string): number {
  const a = Date.parse(`${earlier}T00:00:00Z`) / 86_400_000;
  const b = Date.parse(`${later}T00:00:00Z`) / 86_400_000;
  return b - a;
}

/** Weekday for a yyyy-MM-dd key, JS convention (0=Sun..6=Sat). BD uses 0=Sun,5=Fri. */
export function weekdayOf(dateKey: string): number {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`)).getUTCDay();
}

/**
 * Working-date key a scan instant belongs to: the Dhaka date whose shift the
 * scan counts against. For overnight shifts, scans between shift end (next
 * morning) and the next shift start are ambiguous; they are split at the
 * midpoint (see `overnightCutoff`) — morning checkouts land on the previous
 * day's shift, evening arrivals on the current day's.
 */
export function workingDateForScan(
  startMin: number,
  endMin: number,
  overnight: boolean,
  ts: Date,
): string {
  const date = dateKeyInZone(ts, TZ);
  if (overnight && minutesOfDay(ts, TZ) < overnightCutoff(startMin, endMin)) return addDays(date, -1);
  return date;
}

/**
 * Midpoint (minutes since Dhaka midnight) between an overnight shift's end and
 * its next start: scans before it belong to the previous day's shift.
 * E.g. 22:00->06:00 => (360 + 1320) / 2 = 840 (14:00).
 */
export function overnightCutoff(startMin: number, endMin: number): number {
  return endMin + (startMin - endMin) / 2;
}

/** All yyyy-MM-dd keys in [from, to] inclusive. */
export function rangeKeys(from: string, to: string): string[] {
  const out: string[] = [];
  const total = diffDays(from, to);
  for (let i = 0; i <= total; i++) out.push(addDays(from, i));
  return out;
}

/** yyyy-MM for a date key. */
export function monthOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** Current yyyy-MM month key in Asia/Dhaka. */
export function currentMonthKey(now = new Date()): string {
  return monthOf(dateKeyInZone(now, TZ));
}

/** True if key1 and key2 are in the same calendar month. */
export function sameMonth(key1: string, key2: string): boolean {
  return monthOf(key1) === monthOf(key2);
}

/** Days in the month of a yyyy-MM key. */
export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}