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
  const add = (value: string | undefined) => {
    if (!value) return;
    for (const part of value.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      try {
        origins.add(new URL(trimmed).origin);
      } catch {
        /* not an origin — ignore it */
      }
    }
  };
  add(process.env.BETTER_AUTH_URL);
  // Extra origins the app already trusts (dev tunnels, a staging host, …).
  // A ceremony from an origin outside this list is rejected by the browser.
  add(process.env.BETTER_AUTH_TRUSTED_ORIGINS);
  origins.add("http://localhost:3000");
  return { rpID: WEBAUTHN_RP_ID, rpName: WEBAUTHN_RP_NAME, origins: [...origins] };
}
