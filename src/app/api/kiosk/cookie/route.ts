import { NextResponse } from "next/server";
import { KIOSK_KEY } from "@/lib/constants";
import { newKioskCookie, safeEqualStrings } from "@/app/api/kiosk/token/route";

export const dynamic = "force-dynamic";

const COOKIE_MAX_AGE_S = 12 * 60 * 60;

/**
 * Exchanges the kiosk key for a signed, httpOnly cookie (12h). The key must be
 * presented explicitly (?key= or x-kiosk-key) — this endpoint never mints a
 * cookie for anonymous callers.
 */
export async function GET(request: Request) {
  if (!KIOSK_KEY) {
    return NextResponse.json({ error: "kiosk not configured" }, { status: 503 });
  }
  const url = new URL(request.url);
  const key = request.headers.get("x-kiosk-key") ?? url.searchParams.get("key") ?? "";
  if (!safeEqualStrings(key, KIOSK_KEY)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { name, value } = await newKioskCookie();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S,
  });
  return res;
}
