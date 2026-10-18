// Idempotent password seeding for email+password login.
// Creates user docs + "credential" accounts using the exact better-auth scrypt
// format (salt:key, N=16384, r=16, p=1, dkLen=64) so /sign-in/email works.
// Usage: node scripts/seed-passwords.mjs [email ...]   (requires MONGODB_URI)
import { MongoClient } from "mongodb";
import { randomBytes, scrypt } from "node:crypto";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is required");
  process.exit(1);
}
const dbName = process.env.MONGODB_DB || "attendance";

const PASSWORD = process.env.DEMO_PASSWORD;
if (!PASSWORD) {
  console.error("DEMO_PASSWORD is required, e.g.: DEMO_PASSWORD=<secret> node scripts/seed-passwords.mjs");
  process.exit(1);
}

const ACCOUNTS = [
  { email: "developer.1and9@gmail.com", name: "Owner", password: PASSWORD },
  { email: "demo.admin@demo.com", name: "Demo Admin", password: PASSWORD },
  { email: "demo.alice@demo.com", name: "Demo Alice", password: PASSWORD },
  { email: "demo.bob@demo.com", name: "Demo Bob", password: PASSWORD },
  { email: "demo.carol@demo.com", name: "Demo Carol", password: PASSWORD },
  { email: "demo.dave@demo.com", name: "Demo Dave", password: PASSWORD },
  { email: "demo.erin@demo.com", name: "Demo Erin", password: PASSWORD },
  { email: "demo.frank@demo.com", name: "Demo Frank", password: PASSWORD },
];

function generateId() {
  return randomBytes(12).toString("hex");
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await new Promise((resolve, reject) => {
    scrypt(
      String(password).normalize("NFKC"),
      salt,
      64,
      { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 },
      (err, derived) => (err ? reject(err) : resolve(derived))
    );
  });
  return `${salt}:${key.toString("hex")}`;
}

const client = new MongoClient(uri, { appName: "office-attendance-pw" });
const db = client.db(dbName);

// Optional CLI args limit the run to the named emails (e.g. only the admin).
const only = new Set(
  process.argv
    .slice(2)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);
const targets = only.size
  ? ACCOUNTS.filter((a) => only.has(a.email.toLowerCase()))
  : ACCOUNTS;
if (only.size && targets.length !== only.size) {
  const known = new Set(ACCOUNTS.map((a) => a.email.toLowerCase()));
  const unknown = [...only].filter((e) => !known.has(e));
  if (unknown.length) {
    console.error(`Unknown email(s): ${unknown.join(", ")}`);
    console.error(`Known: ${[...known].join(", ")}`);
    process.exit(1);
  }
}

async function main() {
  const users = db.collection("user");
  const accounts = db.collection("account");
  const now = new Date();

  for (const a of targets) {
    let user = await users.findOne({ email: a.email.toLowerCase() });
    if (!user) {
      const id = generateId();
      await users.insertOne({
        _id: id,
        name: a.name,
        email: a.email.toLowerCase(),
        emailVerified: true,
        role: "employee",
        createdAt: now,
        updatedAt: now,
      });
      user = { _id: id, email: a.email.toLowerCase() };
      console.log(`created user ${user.email}`);
    }

    const hash = await hashPassword(a.password);
    await accounts.updateOne(
      { userId: user._id, providerId: "credential", accountId: user._id },
      { $set: { password: hash, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );
    console.log(`${user.email.padEnd(34)} ${a.password}`);
  }

  await client.close();
}

await client.connect();
try {
  await main();
  console.log("Passwords ready.");
} catch (e) {
  console.error(e);
  process.exit(1);
}