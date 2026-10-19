import type { BiometricPolicy } from "./types.ts";

export interface BiometricDecision {
  /** The check-in must carry a verified fingerprint assertion. */
  required: boolean;
  /** The employee may enrol / use a fingerprint at all. */
  allowed: boolean;
}

/**
 * Decides what the check-in route demands of this employee on this device.
 *
 * - off      → no biometric, ever.
 * - exempt   → no biometric required (phone without a sensor), but allowed.
 * - required → a verified assertion is mandatory; enrolment is mandatory too.
 * - optional → a verified assertion is mandatory *once the device has an
 *   enrolled credential*. That is what stops someone from skipping the prompt
 *   by never enrolling: the server, not the browser, decides.
 */
export function resolveBiometricPolicy(
  policy: BiometricPolicy,
  exempt: boolean,
  enrolled: boolean,
): BiometricDecision {
  if (policy === "off") return { required: false, allowed: false };
  if (exempt) return { required: false, allowed: true };
  if (policy === "required") return { required: true, allowed: true };
  return { required: enrolled, allowed: true };
}

/**
 * Pull the base64url challenge out of a WebAuthn response's clientDataJSON.
 * The server looks the pending challenge up by this value, so the client
 * never gets to pick which challenge it is answering.
 */
export function challengeFromClientData(clientDataJSON: string): string | null {
  try {
    const raw = Buffer.from(clientDataJSON, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as { challenge?: unknown };
    return typeof parsed.challenge === "string" ? parsed.challenge : null;
  } catch {
    return null;
  }
}
