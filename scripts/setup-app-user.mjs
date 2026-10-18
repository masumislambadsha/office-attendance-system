// Create/verify the least-privilege app DB user with a locked-down audit_log role.
// audit_log is append-only at the DB level: the app user can insert + find on it,
// but cannot update, delete, or drop the collection.
//
// IMPORTANT: privileges are additive in MongoDB, so granting the blanket
// `readWrite` role on the database would override the audit lock. The role is
// therefore built from explicit per-collection privileges.
//
// Requirements:
//   MONGODB_ADMIN_URI  — URI of an Atlas user with owner/userAdmin rights
//   MONGODB_DB         — app database name (default: attendance)
//   MONGODB_APP_USER   — app user name (default: attendance_app)
//   MONGODB_APP_PASS   — app user password (default: generate random)
//
// Usage: node scripts/setup-app-user.mjs
//
// NOTE: some Atlas shared tiers (M0) do not allow creating custom roles from a
// driver connection. If createRole fails on your tier, do it manually in Atlas:
//   Database Access -> Custom Roles -> New Custom Role:
//     readWrite on <db>.* (per-collection actions find/insert/update/remove,
//     see APP_COLLECTIONS below)
//     find + insert only on <db>.audit_log
//   then assign that role to the app user in Database Access.
import { MongoClient } from "mongodb";
import crypto from "node:crypto";

const adminUri = process.env.MONGODB_ADMIN_URI;
if (!adminUri) {
  console.error("MONGODB_ADMIN_URI is required (privileged/owner credentials)");
  process.exit(1);
}

const dbName = process.env.MONGODB_DB || "attendance";
const appUser = process.env.MONGODB_APP_USER || "attendance_app";
const appPass = process.env.MONGODB_APP_PASS || crypto.randomBytes(18).toString("base64url");

// Everything the app reads/writes (src/lib/mongo.ts) except audit_log,
// plus the better-auth collections (user/session/account/verification).
const APP_COLLECTIONS = [
  "employees", "devices", "shifts", "shift_overrides", "holidays", "check_ins",
  "daily_status", "leave_types", "leave_balances", "leave_requests",
  "deduction_rules", "payroll_adjustments", "payroll_closes",
  "used_tokens", "job_runs", "rate_limits",
  "user", "session", "account", "verification",
];

const READ_WRITE_ACTIONS = ["find", "insert", "update", "remove"];
const roleName = "attendance_app_rw";
const appUserRole = [{ role: roleName, db: dbName }];

const privileges = [
  ...APP_COLLECTIONS.map((collection) => ({
    resource: { db: dbName, collection },
    actions: READ_WRITE_ACTIONS,
  })),
  // audit_log: insert + find only. No update/remove/collection admin.
  { resource: { db: dbName, collection: "audit_log" }, actions: ["find", "insert"] },
];

const isAlreadyExists = (e) =>
  String(e?.code ?? "").includes("51003") ||
  /already exists/i.test(String(e?.errmsg ?? ""));

const client = new MongoClient(adminUri, { appName: "attendance-acl-setup" });

await client.connect();
try {
  const admin = client.db("admin");
  // Ensure the custom role exists with exactly these privileges (idempotent;
  // re-applies so privileges stay locked down even if previously misconfigured).
  const roleInfo = await admin.command({ rolesInfo: roleName }).catch(() => null);
  if (roleInfo && (roleInfo.roles ?? []).length > 0) {
    await admin.command({ updateRole: roleName, privileges, roles: [] });
  } else {
    await admin.command({ createRole: roleName, privileges, roles: [] });
  }

  await admin.command({
    createUser: appUser,
    pwd: appPass,
    roles: appUserRole,
  }).catch((e) => {
    if (isAlreadyExists(e)) {
      return admin.command({ updateUser: appUser, pwd: appPass, roles: appUserRole });
    }
    throw e;
  });

  console.log(`app user '${appUser}' ready on db '${dbName}'. audit_log is insert+find only.`);
  console.log(`Set in .env.local:\nMONGODB_URI=mongodb+srv://${appUser}:<password>@<cluster-host>/?authSource=admin`);
  if (!process.env.MONGODB_APP_PASS) {
    console.warn(`Generated password (save it now): ${appPass}`);
  }
} finally {
  await client.close();
}
