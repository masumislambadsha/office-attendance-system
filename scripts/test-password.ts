// Runs with: node scripts/test-password.ts (Node 20.11+ type stripping)
// Covers the credential hashing used by better-auth's email/password provider.
import { generatePassword, hashPassword, verifyPassword } from "../src/lib/password.ts";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.error(`FAIL ${name}`);
  }
}

console.log("password hashing");

const generated = generatePassword();
check("generated password matches the hand-over format", /^Attend-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(generated));
check("two generated passwords differ", generatePassword() !== generatePassword());

const hash = await hashPassword("Correct-Horse-42");
check("hash is salt:key hex", /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(hash));
check("correct password verifies", await verifyPassword("Correct-Horse-42", hash));
check("wrong password is rejected", !(await verifyPassword("Correct-Horse-43", hash)));
check("hash is salted (same password, different hash)", (await hashPassword("Correct-Horse-42")) !== hash);
check(
  "NFKC normalisation matches better-auth",
  await verifyPassword("e\u0301", await hashPassword("\u00e9")),
);
check("malformed stored hash is rejected", !(await verifyPassword("anything", "not-a-hash")));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
