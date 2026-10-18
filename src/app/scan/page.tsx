"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TriangleAlert, CameraOff } from "lucide-react";

const DEVICE_KEY = "att.deviceId";
const TOKEN_KEY = "att.deviceToken";
const READER_ID = "att-qr-reader";

type DeviceState = "loading" | "pending" | "approved" | "revoked" | "error";

interface ScanResult {
  kind: "in" | "out";
  status: string;
  message: string;
  checkedAt: string;
  date: string;
}

export default function ScanPage() {
  const [deviceState, setDeviceState] = useState<DeviceState>("loading");
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);
  const scanner = useRef<Html5Qrcode | null>(null);
  const tokenRef = useRef<string | null>(null);
  const stopRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());

  const getPosition = useCallback((): Promise<{ lat: number; lng: number; accuracy: number } | null> => {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        () => resolve(null),
        { timeout: 10_000, maximumAge: 60_000 },
      );
    });
  }, []);

  const ensureDevice = useCallback(async () => {
    let deviceId = localStorage.getItem(DEVICE_KEY);
    if (!deviceId) {
      deviceId = `${crypto.randomUUID()}`;
      localStorage.setItem(DEVICE_KEY, deviceId);
    }
    try {
      const res = await fetch("/api/device/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      const body = (await res.json()) as { device_token?: string; status?: string; error?: string };
      if (!res.ok || !body.device_token) {
        setDeviceError(body.error ?? "device registration failed");
        setDeviceState("error");
        return;
      }
      localStorage.setItem(TOKEN_KEY, body.device_token);
      tokenRef.current = body.device_token;
      setDeviceState(body.status as DeviceState);
    } catch {
      setDeviceError("could not reach the server");
      setDeviceState("error");
    }
  }, []);

  useEffect(() => {
    // Intentional: register this install's device id once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void ensureDevice();
  }, [ensureDevice]);

  const stopScanner = useCallback(async () => {
    stopRef.current = true;
    if (scanner.current && scanner.current.isScanning) {
      await scanner.current.stop().catch(() => undefined);
    }
  }, []);

  const handleToken = useCallback(
    async (token: string) => {
      // Ref-based guard: the scanner callback holds a stale closure, so the
      // `busy` state check never fires and every frame re-sends the same token.
      if (stopRef.current || seenRef.current.has(token)) return;
      seenRef.current.add(token);
      setBusy(true);
      setScanError(null);
      setLocNote("Getting your location…");
      try {
        const pos = await getPosition();
        const payload: Record<string, unknown> = { token, device_token: tokenRef.current };
        if (pos) {
          payload.lat = pos.lat;
          payload.lng = pos.lng;
          payload.accuracy = pos.accuracy;
          setLocNote("Location attached to this scan.");
        } else {
          setLocNote("Location unavailable — scan may be rejected outside the office.");
        }
        const res = await fetch("/api/check-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = (await res.json()) as ScanResult & { error?: string; code?: string };
        if (!res.ok || !body.message) {
          throw new Error(body.error ?? "check-in failed");
        }
        setResult(body);
        // Halt the camera so it stops re-reading the same (now consumed) QR.
        void stopScanner();
      } catch (e) {
        setScanError(e instanceof Error ? e.message : "check-in failed");
      } finally {
        setBusy(false);
      }
    },
    [getPosition, stopScanner],
  );

  const startScanner = useCallback(async () => {
    stopRef.current = false;
    seenRef.current.clear();
    setResult(null);
    setScanError(null);
    setLocNote(null);
    if (!scanner.current) {
      scanner.current = new Html5Qrcode(READER_ID);
    }
    try {
      await scanner.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => void handleToken(decodedText),
        () => undefined,
      );
    } catch {
      setScanError("Camera unavailable. Make sure you allowed camera access (needs HTTPS).");
    }
  }, [handleToken]);

  useEffect(() => () => void stopScanner(), [stopScanner]);

  return (
    <main className="flex flex-1 flex-col items-center p-4">
      <header className="mb-4 flex w-full max-w-md items-center justify-between">
        <div>
          <h1 className="font-serif text-xl font-bold tracking-tight text-[#1a1a1a]">Scan the kiosk QR</h1>
          <p className="text-sm text-muted-foreground">
            {deviceState === "approved"
              ? "Device ready — scan the rotating QR at the entrance."
              : deviceState === "pending"
                ? "Device pending admin approval."
                : deviceState === "loading"
                  ? "Registering device…"
                  : "Device problem."}
          </p>
        </div>
      </header>

      {deviceState === "revoked" && (
        <Alert variant="destructive" className="mb-3 w-full max-w-md">
          <CameraOff />
          <AlertDescription>
            This device was revoked. Refresh the page to re-register; an admin must approve it again.
          </AlertDescription>
        </Alert>
      )}

      <div className="w-full max-w-md">
        <div
          id={READER_ID}
          className="overflow-hidden rounded-[2rem] border border-warm-100 bg-white shadow-[0_1px_2px_rgba(42,38,34,0.05)]"
        />

        <div className="mt-3 flex justify-center">
          <Button
            type="button"
            loading={busy}
            disabled={deviceState !== "approved"}
            onClick={() => void startScanner()}
          >
            {result ? "Scan again" : "Start camera"}
          </Button>
        </div>

        {result && (
          <div
            className={cn(
              "mt-4 rounded-[2rem] border border-warm-100 bg-white p-6 text-center shadow-[0_1px_2px_rgba(42,38,34,0.05)]",
            )}
          >
            <p className={cn("font-serif text-2xl font-bold", result.kind === "in" ? "text-emerald-700" : "text-sky-700")}>
              {result.kind === "in" ? "Checked in" : "Checked out"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{result.message}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {result.date} at {new Date(result.checkedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka" })} ·
              status: {result.status}
            </p>
          </div>
        )}
        {locNote && !result && (
          <p className="mt-3 text-center text-xs text-muted-foreground">{locNote}</p>
        )}
        {(scanError || deviceError) && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-sm font-medium text-red-600">
            <TriangleAlert className="size-4" />
            {scanError ?? deviceError}
          </p>
        )}
      </div>
    </main>
  );
}