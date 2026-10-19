"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TriangleAlert, CameraOff, Fingerprint } from "lucide-react";

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

interface BioStatus {
  policy: "off" | "optional" | "required";
  device_status: string;
  enrolled: boolean;
  credential_count: number;
  exempt: boolean;
  required: boolean;
  allowed: boolean;
}

interface PendingCheck {
  token: string;
  options: unknown;
  pos: { lat: number; lng: number; accuracy: number } | null;
}

export default function ScanPage() {
  const [deviceState, setDeviceState] = useState<DeviceState>("loading");
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);
  const [bio, setBio] = useState<BioStatus | null>(null);
  const [bioNote, setBioNote] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [pending, setPending] = useState<PendingCheck | null>(null);
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

  /** What the server says about the fingerprint factor on this device. */
  const refreshBio = useCallback(async () => {
    if (!tokenRef.current) return;
    try {
      const res = await fetch(`/api/webauthn/status?device_token=${encodeURIComponent(tokenRef.current)}`);
      if (!res.ok) return;
      setBio((await res.json()) as BioStatus);
    } catch {
      /* the factor is simply unavailable on this request */
    }
  }, []);

  useEffect(() => {
    // Intentional: register this install's device id once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void ensureDevice();
  }, [ensureDevice]);

  useEffect(() => {
    // The biometric status depends on the device token, so it is read once the
    // device state settles.
    void refreshBio();
  }, [refreshBio, deviceState]);

  const stopScanner = useCallback(async () => {
    stopRef.current = true;
    if (scanner.current && scanner.current.isScanning) {
      await scanner.current.stop().catch(() => undefined);
    }
  }, []);

  const submitCheckIn = useCallback(
    async (token: string, pos: { lat: number; lng: number; accuracy: number } | null, assertion: unknown) => {
      const payload: Record<string, unknown> = { token, device_token: tokenRef.current };
      if (pos) {
        payload.lat = pos.lat;
        payload.lng = pos.lng;
        payload.accuracy = pos.accuracy;
      }
      if (assertion) payload.assertion = assertion;

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
      setPending(null);
    },
    [],
  );

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
        const useBiometric = !!bio?.enrolled && bio.policy !== "off";

        if (!useBiometric) {
          // The server would refuse this anyway ("fingerprint confirmation
          // required") — say it plainly instead of letting the scan fail.
          if (bio?.policy === "required" && !bio.exempt) {
            throw new Error("Set up your fingerprint on this device before checking in.");
          }
          setLocNote(pos ? "Location attached to this scan." : "Location unavailable.");
          await submitCheckIn(token, pos, null);
          void stopScanner();
          return;
        }

        // The system checks the QR, the device and the location *before* the
        // phone asks for a fingerprint — nobody touches a sensor for a scan
        // that was going to be refused anyway.
        setLocNote("Checking the code, this device and your location…");
        const res = await fetch("/api/webauthn/authenticate/options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            device_token: tokenRef.current,
            ...(pos ? { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy } : {}),
          }),
        });
        const body = (await res.json()) as { options?: unknown; error?: string; code?: string };
        if (!res.ok || !body.options) {
          throw new Error(body.error ?? "could not start the fingerprint check");
        }
        setPending({ token, options: body.options, pos });
        setLocNote(null);
        void stopScanner();
      } catch (e) {
        setScanError(e instanceof Error ? e.message : "check-in failed");
        // Let the same code be scanned again: with a static QR the code never
        // changes, so blocking it would strand the employee.
        seenRef.current.delete(token);
        void stopScanner();
      } finally {
        setBusy(false);
      }
    },
    [bio, getPosition, stopScanner, submitCheckIn],
  );

  /** Step 2: the employee touches the sensor. */
  const confirmFingerprint = useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    setScanError(null);
    try {
      // Called straight from the tap: iOS needs the user gesture to still be
      // live when the authenticator prompt opens.
      const assertion = await startAuthentication({ optionsJSON: pending.options as never });
      await submitCheckIn(pending.token, pending.pos, assertion);
    } catch (e) {
      const err = e as { name?: string; message?: string };
      setScanError(
        err?.name === "NotAllowedError"
          ? "Fingerprint cancelled — scan the QR again."
          : (err?.message ?? "fingerprint check failed"),
      );
      setPending(null);
    } finally {
      setBusy(false);
    }
  }, [pending, submitCheckIn]);

  /** Enrol this phone's fingerprint (once per approved device). */
  const enrolFingerprint = useCallback(async () => {
    setEnrolling(true);
    setBioNote(null);
    setScanError(null);
    try {
      const res = await fetch("/api/webauthn/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_token: tokenRef.current }),
      });
      const body = (await res.json()) as { options?: unknown; error?: string };
      if (!res.ok || !body.options) throw new Error(body.error ?? "could not start the setup");

      const attestation = await startRegistration({ optionsJSON: body.options as never });

      const verRes = await fetch("/api/webauthn/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_token: tokenRef.current, response: attestation }),
      });
      const verBody = (await verRes.json()) as { error?: string };
      if (!verRes.ok) throw new Error(verBody.error ?? "fingerprint setup failed");

      setBioNote("Fingerprint set up on this device.");
      await refreshBio();
    } catch (e) {
      const err = e as { name?: string; message?: string };
      setScanError(
        err?.name === "NotAllowedError"
          ? "Setup cancelled — try again when you are ready."
          : (err?.message ?? "fingerprint setup failed"),
      );
    } finally {
      setEnrolling(false);
    }
  }, [refreshBio]);

  const startScanner = useCallback(async () => {
    stopRef.current = false;
    seenRef.current.clear();
    setResult(null);
    setScanError(null);
    setLocNote(null);
    setPending(null);
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

  const bioActive = !!bio && bio.policy !== "off";
  const needsEnrolment = bioActive && !bio.exempt && !bio.enrolled;

  return (
    <main className="flex flex-1 flex-col items-center p-4">
      <header className="mb-4 flex w-full max-w-md items-center justify-between">
        <div>
          <h1 className="font-serif text-xl font-bold tracking-tight text-[#1a1a1a]">Scan the office QR</h1>
          <p className="text-sm text-muted-foreground">
            {deviceState === "approved"
              ? "Device ready — scan the code at the entrance."
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

      {needsEnrolment && deviceState === "approved" && (
        <Alert className="mb-3 w-full max-w-md">
          <Fingerprint />
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>
              {bio?.policy === "required"
                ? "This office needs a fingerprint check. Set yours up on this phone to check in."
                : "Set up your fingerprint on this phone to make check-in tamper-proof."}
            </span>
            <Button type="button" size="sm" loading={enrolling} onClick={() => void enrolFingerprint()}>
              Set up fingerprint
            </Button>
            {bioNote && <span className="text-xs font-semibold text-emerald-700">{bioNote}</span>}
          </AlertDescription>
        </Alert>
      )}

      {bioActive && bio?.enrolled && !needsEnrolment && (
        <p className="mb-3 flex w-full max-w-md items-center gap-1.5 text-xs font-semibold text-sage-700">
          <Fingerprint className="size-4" />
          Fingerprint ready on this device — you will confirm each scan with it.
        </p>
      )}

      <div className="w-full max-w-md">
        <div
          id={READER_ID}
          className="overflow-hidden rounded-[2rem] border border-warm-100 bg-white shadow-[0_1px_2px_rgba(42,38,34,0.05)]"
        />

        <div className="mt-3 flex flex-col gap-2">
          <Button
            type="button"
            loading={busy}
            disabled={deviceState !== "approved" || !!pending}
            onClick={() => void startScanner()}
          >
            {result ? "Scan again" : "Start camera"}
          </Button>

          {pending && (
            <Button type="button" loading={busy} onClick={() => void confirmFingerprint()}>
              <Fingerprint className="size-4" />
              Confirm with fingerprint
            </Button>
          )}
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
