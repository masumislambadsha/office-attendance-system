import type { BiometricPolicy } from "@/attend/types";

export const TIMEZONE = process.env.TIMEZONE ?? "Asia/Dhaka";
export const QR_EXPIRY_SECONDS = Number(process.env.QR_EXPIRY_SECONDS ?? 45);
export const QR_REFRESH_MS = Number(process.env.QR_REFRESH_MS ?? 30_000);
export const DUPLICATE_SCAN_WINDOW_MIN = Number(process.env.DUPLICATE_SCAN_WINDOW_MIN ?? 2);
export const CHECKIN_RATE_LIMIT = Number(process.env.CHECKIN_RATE_LIMIT ?? 10);
export const CRON_SECRET = process.env.CRON_SECRET ?? "";
export const KIOSK_KEY = process.env.KIOSK_KEY ?? "";
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";

export const OFFICE_LAT = Number(process.env.OFFICE_LAT ?? NaN);
export const OFFICE_LNG = Number(process.env.OFFICE_LNG ?? NaN);
export const OFFICE_RADIUS_M = Number(process.env.OFFICE_RADIUS_M ?? 150);
export const OFFICE_CONFIGURED = Number.isFinite(OFFICE_LAT) && Number.isFinite(OFFICE_LNG);
/** A GPS fix this coarse cannot prove presence — reject it rather than guess. */
export const GEOFENCE_MAX_ACCURACY_M = Number(process.env.GEOFENCE_MAX_ACCURACY_M ?? 100);

/**
 * QR mode.
 * - "dynamic": the kiosk mints a fresh 45s single-use token every 30s. Proves
 *   physical presence at the entrance. Needs a device left running at the door.
 * - "static": one fixed, signed code (printed and posted, or shown on any
 *   screen). Proves nothing about presence — the remaining factors (device
 *   binding, geofence, biometric) carry that weight. Needs no always-on device.
 */
export type QrMode = "dynamic" | "static";
export const QR_MODE: QrMode = process.env.QR_MODE === "static" ? "static" : "dynamic";
/** Bump to invalidate every printed copy of the static code. */
export const STATIC_QR_VERSION = process.env.STATIC_QR_VERSION ?? "1";

/**
 * Biometric (WebAuthn) check-in factor.
 * - "off": never ask for a fingerprint.
 * - "optional": ask when the device has an enrolled credential; employees who
 *   never enrolled can still check in.
 * - "required": every employee (except admin-exempt ones) must have an
 *   enrolled credential and pass the fingerprint check.
 */
export const BIOMETRIC_POLICY: BiometricPolicy =
  process.env.BIOMETRIC_POLICY === "required"
    ? "required"
    : process.env.BIOMETRIC_POLICY === "optional"
      ? "optional"
      : "off";

/**
 * WebAuthn relying party. The RP ID is the domain the credential is bound to:
 * change it and every enrolled fingerprint is dead, so settle the production
 * domain before anyone enrolls.
 */
export const WEBAUTHN_RP_ID =
  process.env.WEBAUTHN_RP_ID || hostOf(process.env.BETTER_AUTH_URL) || "localhost";
export const WEBAUTHN_RP_NAME = process.env.WEBAUTHN_RP_NAME ?? "Office Attendance";
/** How long a pending challenge stays valid. */
export const WEBAUTHN_CHALLENGE_TTL_SECONDS = Number(process.env.WEBAUTHN_CHALLENGE_TTL_SECONDS ?? 300);

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function currentQrSecret(): string {
  const s = process.env.QR_SECRET_CURRENT;
  if (!s) throw new Error("QR_SECRET_CURRENT is not set");
  return s;
}

export function previousQrSecret(): string | null {
  return process.env.QR_SECRET_PREVIOUS || null;
}
