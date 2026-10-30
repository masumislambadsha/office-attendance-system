// Runs with: node scripts/test-webauthn.ts (Node 20.11+ type stripping)
// Covers the pure biometric-factor rules: what the check-in demands of an
// employee, and how the pending challenge is read back out of a response.
import { challengeFromClientData, clientDataJsonFrom, resolveBiometricPolicy } from "../src/attend/biometric.ts";

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.error(`FAIL ${name}\n     got  ${g}\n     want ${w}`);
  }
}

console.log("§4 — biometric policy");
eq(
  "off: never required, never allowed",
  resolveBiometricPolicy("off", false, false),
  { required: false, allowed: false },
);
eq(
  "off: an enrolled credential changes nothing",
  resolveBiometricPolicy("off", false, true),
  { required: false, allowed: false },
);
eq(
  "required: not enrolled is still required (enrolment is mandatory)",
  resolveBiometricPolicy("required", false, false),
  { required: true, allowed: true },
);
eq(
  "required: enrolled is required",
  resolveBiometricPolicy("required", false, true),
  { required: true, allowed: true },
);
eq(
  "optional: not enrolled may check in without a fingerprint",
  resolveBiometricPolicy("optional", false, false),
  { required: false, allowed: true },
);
eq(
  "optional: once enrolled the fingerprint is mandatory",
  resolveBiometricPolicy("optional", false, true),
  { required: true, allowed: true },
);
eq(
  "exempt: never required, even when enrolled",
  resolveBiometricPolicy("required", true, true),
  { required: false, allowed: true },
);
eq(
  "exempt: optional mode also skips the fingerprint",
  resolveBiometricPolicy("optional", true, true),
  { required: false, allowed: true },
);

console.log("§4 — challenge is read out of the signed client data");
const clientData = Buffer.from(
  JSON.stringify({ type: "webauthn.get", challenge: "Y2hhbGxlbmdlLXZhbHVl", origin: "https://office.test" }),
  "utf8",
).toString("base64url");
eq("challenge is extracted", challengeFromClientData(clientData), "Y2hhbGxlbmdlLXZhbHVl");
eq("garbage yields null", challengeFromClientData("not-base64-%%%"), null);
eq("empty yields null", challengeFromClientData(""), null);
eq(
  "json without a challenge yields null",
  challengeFromClientData(Buffer.from(JSON.stringify({ type: "webauthn.get" })).toString("base64url")),
  null,
);

console.log("§4 — the signed client data is found in the WebAuthn JSON shape");
eq(
  "nested shape (what @simplewebauthn/browser sends)",
  clientDataJsonFrom({ id: "cred", response: { clientDataJSON: "nested-value" } }),
  "nested-value",
);
eq(
  "flat shape is still accepted",
  clientDataJsonFrom({ id: "cred", clientDataJSON: "flat-value" }),
  "flat-value",
);
eq("missing response yields null", clientDataJsonFrom({ id: "cred" }), null);
eq("null yields null", clientDataJsonFrom(null), null);
eq("undefined yields null", clientDataJsonFrom(undefined), null);
eq("non-object yields null", clientDataJsonFrom("nope"), null);
eq(
  "nested value wins over flat",
  clientDataJsonFrom({ clientDataJSON: "flat", response: { clientDataJSON: "nested" } }),
  "nested",
);
eq(
  "the challenge is read out of the nested shape",
  challengeFromClientData(
    clientDataJsonFrom({
      id: "cred",
      response: {
        clientDataJSON: Buffer.from(
          JSON.stringify({ type: "webauthn.create", challenge: "Y2hhbGxlbmdlLXZhbHVl" }),
        ).toString("base64url"),
      },
    }) ?? "",
  ),
  "Y2hhbGxlbmdlLXZhbHVl",
);

console.log("");
if (fail === 0) {
  console.log(`${pass} passed, 0 failed`);
} else {
  console.error(`${pass} passed, ${fail} failed`);
  process.exit(1);
}
