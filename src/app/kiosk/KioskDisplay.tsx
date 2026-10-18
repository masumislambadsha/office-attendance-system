"use client";

import { useEffect, useState } from "react";
import { cn } from "cn";

const REFRESH_MS = 30_000;

export default function KioskDisplay() {
  const [qr, setQr] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number>(REFRESH_MS / 1000);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    // The kiosk key arrives once as /kiosk?key=…; exchange it for the signed
    // cookie, then strip it from the address bar so it is not left on screen.
    const url = new URL(window.location.href);
    const kioskKey = url.searchParams.get("key");
    if (kioskKey) {
      url.searchParams.delete("key");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }

    const mint = () => fetch("/api/kiosk/token", { cache: "no-store" });

    const tick = async (): Promise<void> => {
      try {
        let res = await mint();
        if (res.status === 401) {
          const bootstrap = kioskKey
            ? `/api/kiosk/cookie?key=${encodeURIComponent(kioskKey)}`
            : "/api/kiosk/cookie";
          await fetch(bootstrap, { cache: "no-store" });
          res = await mint();
        }
        if (res.status === 401 || res.status === 503) {
          if (alive) setError("Kiosk not authorized — open this page with its ?key= link");
          return;
        }
        if (!res.ok) throw new Error("could not reach token service");
        const data = (await res.json()) as { qr: string; expiresAt: string };
        if (!alive) return;
        setQr(data.qr);
        const expiry = new Date(data.expiresAt).getTime();
        setExpiresIn(Math.max(1, Math.round((expiry - Date.now()) / 1000)));
        setError(null);
      } catch {
        if (alive) setError("Kiosk offline — showing last QR");
      }
    };

    void tick();
    const interval = setInterval(() => void tick(), REFRESH_MS);
    const countdown = setInterval(() => setExpiresIn((s) => Math.max(0, s - 1)), 1000);
    return () => {
      alive = false;
      clearInterval(interval);
      clearInterval(countdown);
    };
  }, []);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
      <div>
        <h2 className="font-serif text-2xl font-bold tracking-tight text-[#1a1a1a]">
          Scan to check in / out
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Code refreshes every {REFRESH_MS / 1000}s — sharing a photo will not work.
        </p>
      </div>

      <div className="relative w-full rounded-[2rem] border border-warm-100 bg-white p-6 shadow-2xl shadow-black/[0.05]">
        {qr ? (
          <img src={qr} alt="Scan this QR with the attendance app" className="h-72 w-full object-contain" draggable={false} />
        ) : (
          <div className="flex h-72 w-full items-center justify-center text-muted-foreground">
            {error ?? "Loading…"}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 flex justify-center translate-y-1/2">
          <span
            className={cn(
              "inline-flex items-center rounded-full bg-[#1a1a1a] px-4 py-1.5 text-xs font-semibold text-warm-50",
              expiresIn <= 10 && "bg-amber-500",
            )}
            aria-live="polite"
          >
            QR expires in {expiresIn}s
          </span>
        </div>
      </div>

      {error && <p className="text-sm font-medium text-amber-700">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Attendance kiosk · {new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}
      </p>
    </div>
  );
}