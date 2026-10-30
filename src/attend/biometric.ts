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

/**
 * The signed clientDataJSON out of a WebAuthn response.
 *
 * `@simplewebauthn/browser` hands back the WebAuthn JSON shape, where the
 * signed bytes sit one level down: `response.response.clientDataJSON`. The
 * flat shape is accepted as well, so a client cannot be turned away by the
 * nesting of its own payload — but the nested one is what the library
 * actually sends.
 */
export function clientDataJsonFrom(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const outer = response as { clientDataJSON?: unknown; response?: { clientDataJSON?: unknown } };
  const nested = outer.response?.clientDataJSON;
  if (typeof nested === "string" && nested.length > 0) return nested;
  const flat = outer.clientDataJSON;
  if (typeof flat === "string" && flat.length > 0) return flat;
  return null;
}
