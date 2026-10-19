import { WEBAUTHN_RP_ID, WEBAUTHN_RP_NAME } from "@/lib/constants";

export interface RpConfig {
  rpID: string;
  rpName: string;
  /** Origins a ceremony is allowed to come from. */
  origins: string[];
}

/**
 * The relying party the credentials are bound to. `rpID` is the domain —
 * change it and every enrolled fingerprint stops working, so it must be the
 * production domain before enrolment starts.
 */
export function rpConfig(): RpConfig {
  const origins = new Set<string>();
  const base = process.env.BETTER_AUTH_URL;
  if (base) {
    try {
      origins.add(new URL(base).origin);
    } catch {
      /* fall through to the defaults */
    }
  }
  origins.add("http://localhost:3000");
  return { rpID: WEBAUTHN_RP_ID, rpName: WEBAUTHN_RP_NAME, origins: [...origins] };
}
