import { getDb } from "@/lib/mongo";

/**
 * Delete the better-auth login for an email: the user row, every linked
 * provider account, and all sessions. Employee/attendance history is untouched,
 * so the email can register again or an admin can create a fresh password.
 */
export async function removeLoginByEmail(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  const db = getDb();
  const user = await db.collection("user").findOne({ email: normalized });
  if (!user) return false;

  await Promise.all([
    db.collection("account").deleteMany({ userId: user._id }),
    db.collection("session").deleteMany({ userId: user._id }),
    db.collection("user").deleteOne({ _id: user._id }),
  ]);

  return true;
}
