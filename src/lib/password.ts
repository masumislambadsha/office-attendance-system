import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Password hashing for the better-auth `credential` provider.
 *
 * better-auth stores scrypt as `salt:key` with N=16384, r=16, p=1, dkLen=64
 * and NFKC-normalises the password first. Both the seeding script and the
 * admin "create login" action must use exactly this format or sign-in fails.
 */

const KEYLEN = 64;
const SCRYPT = { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 } as const;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomChunk(length: number): string {
  return Array.from(randomBytes(length), (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

/** A readable one-time password an admin can hand over. */
export function generatePassword(): string {
  return `Attend-${randomChunk(4)}-${randomChunk(4)}`;
}

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      String(password).normalize("NFKC"),
      salt,
      KEYLEN,
      SCRYPT,
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  if (expected.length !== KEYLEN) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}
