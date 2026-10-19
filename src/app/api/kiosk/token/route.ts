import { NextResponse } from "next/server";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import QRCode from "qrcode";
import { mintQrToken, mintStaticQrToken } from "@/lib/qr";
import { KIOSK_KEY, QR_MODE } from "@/lib/constants";

export const dynamic = "force-dynamic";

export function safeEqualStrings(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function newKioskCookie(): Promise<{ name: string; value: string }> {
  const nonce = randomUUID();
  const sig = createHmac("sha256", KIOSK_KEY).update(nonce).digest("hex");
  return { name: "kiosk_auth", value: `${nonce}.${sig}` };
}

export function kioskCookieOk(raw: string | undefined | null): boolean {
  if (!KIOSK_KEY || !raw) return false;
  const [nonce, sig] = raw.split(".");
  if (!nonce || !sig) return false;
  const expect = createHmac("sha256", KIOSK_KEY).update(nonce).digest("hex");
  return safeEqualStrings(sig, expect);
}

/**
 * Kiosk QR mint. Authenticated by either the x-kiosk-key header or the signed
 * kiosk_auth cookie set by the /api/kiosk/cookie bootstrap (the key never ships
 * to the browser beyond that one exchange). Returns the signed token plus a
 * rendered QR so the kiosk page never bundles a QR library or the signing
 * secret. Fails closed when KIOSK_KEY is unset.
 *
 * In "static" mode the same route serves the one fixed site code, so the kiosk
 * page needs no change of its own — it just stops counting down.
 */
export async function GET(request: Request) {
  if (!KIOSK_KEY) {
    return NextResponse.json({ error: "kiosk not configured" }, { status: 503 });
  }
  const headerKey = request.headers.get("x-kiosk-key");
  const headerOk = headerKey !== null && safeEqualStrings(headerKey, KIOSK_KEY);
  const cookies = request.headers.get("cookie") ?? "";
  const cookieOk = cookies.split(/;\s*/).some((c) => {
    const [name, ...rest] = c.split("=");
    return name === "kiosk_auth" && kioskCookieOk(decodeURIComponent(rest.join("=")));
  });
  if (!headerOk && !cookieOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (QR_MODE === "static") {
    const token = mintStaticQrToken();
    const qr = await QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 1, width: 640 });
    return NextResponse.json({ token, qr, expiresAt: null, mode: "static" });
  }

  const { token, jti, expiresAt } = await mintQrToken();
  const qr = await QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 1, width: 640 });
  void jti; // jti is recorded server-side on use; exposed for debugging only
  return NextResponse.json({ token, qr, expiresAt: expiresAt.toISOString(), mode: "dynamic" });
}
