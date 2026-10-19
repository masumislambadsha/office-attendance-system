import { MongoClient, Db, Collection } from "mongodb";
import {
  AuditLog,
  CheckIn,
  DailyStatusDoc,
  DeductionRule,
  Device,
  Employee,
  Holiday,
  JobRun,
  LeaveBalance,
  LeaveRequest,
  LeaveType,
  PayrollAdjustment,
  PayrollClose,
  RateLimitDoc,
  Shift,
  ShiftOverride,
  UsedToken,
  WebAuthnChallenge,
  WebAuthnCredential,
} from "@/attend/types";

const uri = process.env.MONGODB_URI ?? "";
const dbName = process.env.MONGODB_DB ?? "attendance";

let client: MongoClient | null = null;
let db: Db | null = null;

export function getMongoClient(): MongoClient {
  if (!uri) throw new Error("MONGODB_URI is not set in environment");
  if (!client) {
    client = new MongoClient(uri, { appName: "office-attendance" });
  }
  return client;
}

export function getDb(): Db {
  if (!db) {
    db = getMongoClient().db(dbName);
  }
  return db;
}

export interface Collections {
  employees: Collection<Employee>;
  devices: Collection<Device>;
  shifts: Collection<Shift>;
  shiftOverrides: Collection<ShiftOverride>;
  holidays: Collection<Holiday>;
  checkIns: Collection<CheckIn>;
  dailyStatus: Collection<DailyStatusDoc>;
  leaveTypes: Collection<LeaveType>;
  leaveBalances: Collection<LeaveBalance>;
  leaveRequests: Collection<LeaveRequest>;
  deductionRules: Collection<DeductionRule>;
  payrollAdjustments: Collection<PayrollAdjustment>;
  payrollCloses: Collection<PayrollClose>;
  auditLog: Collection<AuditLog>;
  usedTokens: Collection<UsedToken>;
  webauthnCredentials: Collection<WebAuthnCredential>;
  webauthnChallenges: Collection<WebAuthnChallenge>;
  jobRuns: Collection<JobRun>;
  rateLimits: Collection<RateLimitDoc>;
}

export function collections(dbOverride?: Db): Collections {
  const d = dbOverride ?? getDb();
  return {
    employees: d.collection<Employee>("employees"),
    devices: d.collection<Device>("devices"),
    shifts: d.collection<Shift>("shifts"),
    shiftOverrides: d.collection<ShiftOverride>("shift_overrides"),
    holidays: d.collection<Holiday>("holidays"),
    checkIns: d.collection<CheckIn>("check_ins"),
    dailyStatus: d.collection<DailyStatusDoc>("daily_status"),
    leaveTypes: d.collection<LeaveType>("leave_types"),
    leaveBalances: d.collection<LeaveBalance>("leave_balances"),
    leaveRequests: d.collection<LeaveRequest>("leave_requests"),
    deductionRules: d.collection<DeductionRule>("deduction_rules"),
    payrollAdjustments: d.collection<PayrollAdjustment>("payroll_adjustments"),
    payrollCloses: d.collection<PayrollClose>("payroll_closes"),
    auditLog: d.collection<AuditLog>("audit_log"),
    usedTokens: d.collection<UsedToken>("used_tokens"),
    webauthnCredentials: d.collection<WebAuthnCredential>("webauthn_credentials"),
    webauthnChallenges: d.collection<WebAuthnChallenge>("webauthn_challenges"),
    jobRuns: d.collection<JobRun>("job_runs"),
    rateLimits: d.collection<RateLimitDoc>("rate_limits"),
  };
}