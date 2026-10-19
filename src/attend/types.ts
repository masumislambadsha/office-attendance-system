import type { ObjectId } from "mongodb";

export type Role = "admin" | "employee";

export type DayStatus =
  | "present"
  | "late"
  | "half_day"
  | "absent"
  | "leave"
  | "weekend"
  | "holiday"
  /** Day has not happened yet and is a scheduled working day — undecided, not absent. */
  | "upcoming";

export const DAY_STATUSES: DayStatus[] = [
  "present",
  "late",
  "half_day",
  "absent",
  "leave",
  "weekend",
  "holiday",
  "upcoming",
];

/** Statuses an admin may pick when overriding a day (the calendar/undecided ones are not choices). */
export const CORRECTABLE_STATUSES: DayStatus[] = DAY_STATUSES.filter(
  (s) => s !== "weekend" && s !== "holiday" && s !== "upcoming",
);

export type LeaveRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type DeviceStatus = "pending" | "approved" | "revoked";
export type OversightFlag = "early_exit" | "missing_checkout";

export interface Employee {
  _id: ObjectId;
  name: string;
  email: string;
  shift_id: string;
  weekly_off: number[]; // JS weekday, 0=Sun..6=Sat; BD uses 0=Sun, 5=Fri
  joined_at: string; // yyyy-MM-dd
  active: boolean;
  monthly_gross: number;
  created_at: Date;
  updated_at: Date;
}

export interface Device {
  _id: ObjectId;
  employee_id: ObjectId;
  device_token: string;
  status: DeviceStatus;
  created_at: Date;
  approved_at: Date | null;
}

export interface Shift {
  _id: string; // human key, e.g. "general"
  name: string;
  start_time: string; // "hh:mm" Dhaka
  end_time: string; // "hh:mm" Dhaka
  grace_min: number;
  half_day_after_min: number;
  early_exit_min: number;
  created_at: Date;
}

export interface ShiftOverride {
  _id: ObjectId;
  shift_id: string;
  date_from: string; // yyyy-MM-dd
  date_to: string; // yyyy-MM-dd
  start_time: string;
  end_time: string;
}

export interface Holiday {
  _id: string; // yyyy-MM-dd
  name: string;
}

export interface CheckIn {
  _id: ObjectId;
  employee_id: ObjectId;
  ts: Date;
  kind: "in" | "out";
  token_jti: string;
  meta: Record<string, unknown>; // deferred GPS/selfie lands here
  device_token: string;
}

export interface DailyStatusDoc {
  _id: ObjectId;
  employee_id: ObjectId;
  date: string; // yyyy-MM-dd
  status: DayStatus;
  late_min: number;
  source: "auto" | "manual";
  leave_type_id?: string | null;
  check_in_at?: Date | null;
  check_out_at?: Date | null;
  flag?: OversightFlag | null;
  updated_at: Date;
}

export interface LeaveType {
  _id: string; // "casual" | "sick" | "earned" | "unpaid"
  name: string;
  annual_quota: number;
  earned_accrual: boolean; // true -> 1 day per 18 worked days
  paid: boolean;
}

export interface LeaveBalance {
  _id: ObjectId;
  employee_id: ObjectId;
  type_id: string;
  year: number;
  quota: number; // annual quota (earned: grows with accrual)
  used: number;
  accrual_progress: number; // earned: worked days not yet converted
}

export interface LeaveRequest {
  _id: ObjectId;
  employee_id: ObjectId;
  type_id: string;
  from: string; // yyyy-MM-dd
  to: string; // yyyy-MM-dd
  half_day: boolean;
  reason: string;
  status: LeaveRequestStatus;
  requested_days: number; // includes half-day as 0.5; unpaid/full logic per type
  reviewed_by?: string | null; // actor email
  reviewed_at?: Date | null;
  created_at: Date;
}

export interface DeductionRule {
  _id: string; // "lates_per_absent" | "absent_day_rate" | "half_day_rate" | "unpaid_leave_rate"
  value: number;
  label: string;
}

export interface PayrollAdjustment {
  _id: ObjectId;
  employee_id: ObjectId;
  employee_name: string;
  month: string; // yyyy-MM
  working_days: number;
  present: number;
  late: number;
  half_days: number;
  absents: number;
  leave_paid: number;
  leave_unpaid: number;
  deduction_days: number; // absents + 0.5*half_days + unpaid leaves + lates-derived
  deduction_amount: number;
  gross: number;
  rate_per_day: number;
}

export interface PayrollClose {
  _id: string; // month yyyy-MM
  month: string;
  closed_by: string;
  closed_at: Date;
}

export interface AuditLog {
  _id?: ObjectId;
  actor: string; // email
  action: string;
  entity: string; // "employees:<id>" etc.
  old: unknown;
  new: unknown;
  reason?: string;
  ts: Date;
}

export interface UsedToken {
  _id: ObjectId;
  jti: string;
  createdAt: Date;
}

export interface JobRun {
  _id: string; // "{startedTs}.{rand}"
  job: string;
  started_at: Date;
  finished_at?: Date;
  date?: string;
  status: "running" | "ok" | "error";
  processed?: number;
  error?: string;
}

export interface RateLimitDoc {
  _id: string; // key: `ci:{device_token}`
  count: number;
  createdAt: Date;
}