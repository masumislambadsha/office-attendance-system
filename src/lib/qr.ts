import { SignJWT, jwtVerify } from "jose";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import {
  QR_EXPIRY_SECONDS,
  QR_MODE,
  STATIC_QR_VERSION,
  currentQrSecret,
  previousQrSecret,
  type QrMode,
} from "@/lib/constants";

export interface QrPayload {
  site: "office";
  /** "dynamic" = rotating, single-use, 45s. "static" = fixed signed site code. */
  mode: QrMode;
  /** Single-use token id (dynamic only). */
  jti: string | null;
  iat: number;
}

/** Mint a single-use, HMAC-signed, 45s-expiry QR token. JTI is unique per mint. */
export async function mintQrToken(): Promise<{ token: string; jti: string; expiresAt: Date }> {
  const jti = randomUUID();
  const key = new TextEncoder().encode(currentQrSecret());
  const token = await new SignJWT({ site: "office", mode: "dynamic" })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${QR_EXPIRY_SECONDS}s`)
    .sign(key);
  const expiresAt = new Date(Date.now() + QR_EXPIRY_SECONDS * 1000);
  return { token, jti, expiresAt };
}

/**
 * The static site code: `v1.<version>.<hmac>`.
 *
 * Deliberately short — it gets printed and stuck to a wall, and a dense QR is
 * harder to scan from a phone. The HMAC covers the version, and the version is
 * compared against STATIC_QR_VERSION, so bumping the version invalidates every
 * printed copy at once.
 */
export function mintStaticQrToken(): string {
  return signStaticQrToken(STATIC_QR_VERSION);
}

function signStaticQrToken(version: string): string {
  const body = `v1.${version}`;
  const sig = createHmac("sha256", currentQrSecret()).update(body).digest("base64url").slice(0, 32);
  return `${body}.${sig}`;
}

function verifyStaticQrToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  // Rotating STATIC_QR_VERSION must kill the old printed copies.
  if (parts[1] !== STATIC_QR_VERSION) return false;
  const expected = signStaticQrToken(parts[1]).split(".")[2] ?? "";
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verify a QR payload against the current (and, during rotation, the previous)
 * secret, and against the mode this deployment is running.
 *
 * A dynamic token is rejected while the kiosk runs in static mode and vice
 * versa: switching modes must invalidate whatever was on the wall / on screen.
 */
export async function verifyQrToken(token: string): Promise<QrPayload> {
  if (token.startsWith("v1.")) {
    if (QR_MODE !== "static") throw new Error("static QR code is not in use");
    if (!verifyStaticQrToken(token)) throw new Error("invalid static QR code");
    return { site: "office", mode: "static", jti: null, iat: 0 };
  }

  const candidates = [currentQrSecret(), previousQrSecret()].filter(Boolean) as string[];
  let lastError: unknown = null;
  for (const secret of candidates) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      if (payload.site !== "office") throw new Error("wrong site");
      if (typeof payload.jti !== "string") throw new Error("missing jti");
      const mode: QrMode = payload.mode === "static" ? "static" : "dynamic";
      if (mode !== QR_MODE) throw new Error(`QR mode mismatch: this code is ${mode}`);
      const iat = typeof payload.iat === "number" ? payload.iat : 0;
      return { site: "office", mode, jti: payload.jti, iat };
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error("invalid QR token", { cause: lastError });
}
