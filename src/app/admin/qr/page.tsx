import QRCode from "qrcode";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { QR_MODE, STATIC_QR_VERSION } from "@/lib/constants";
import { mintStaticQrToken } from "@/lib/qr";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Office QR" };

/**
 * The code employees scan at the entrance.
 *
 * In static mode this is the one fixed, signed code — print it, stick it by
 * the door, and no device has to stay switched on. In dynamic mode the
 * rotating code lives on the kiosk page instead.
 */
export default async function AdminQrPage() {
  if (QR_MODE !== "static") {
    return (
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-[#1a1a1a] sm:text-3xl">Office QR</h1>
        <Card className="mt-4 p-6">
          <p className="text-sm text-muted-foreground">
            This deployment runs the <span className="font-semibold">rotating</span> code. It refreshes
            every 30 seconds on the kiosk page and is meant to be shown on a screen at the entrance.
          </p>
          <Link href="/kiosk" className={`${buttonVariants({ size: "sm" })} mt-4 inline-flex`}>
            Open the kiosk display
          </Link>
        </Card>
      </div>
    );
  }

  const token = mintStaticQrToken();
  const qr = await QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 1, width: 800 });

  return (
    <div className="print:mx-auto print:max-w-md">
      <h1 className="font-serif text-2xl font-bold tracking-tight text-[#1a1a1a] print:hidden sm:text-3xl">
        Office QR
      </h1>
      <p className="mt-1 text-sm text-muted-foreground print:hidden">
        One fixed code for the entrance. Print it and put it where employees can reach it.
      </p>

      <Card className="mt-4 p-6 text-center">
        <img
          src={qr}
          alt="Office attendance QR code"
          className="mx-auto h-72 w-full object-contain"
          draggable={false}
        />
        <p className="mt-3 text-sm font-semibold text-[#1a1a1a]">Scan to check in / out</p>
        <p className="text-xs text-muted-foreground">version {STATIC_QR_VERSION}</p>
        <div className="mt-4 flex justify-center print:hidden">
          <PrintButton />
        </div>
      </Card>

      <Card className="mt-4 p-5 text-sm text-muted-foreground print:hidden">
        <p className="font-semibold text-[#1a1a1a]">What this code does and does not prove</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>It does <span className="font-semibold">not</span> prove anyone is at the office.</li>
          <li>
            Presence comes from the other factors: the device must be one you approved, the phone must
            be inside the office radius, and the employee confirms with their own fingerprint.
          </li>
          <li>
            To invalidate every printed copy at once, change <span className="font-mono">STATIC_QR_VERSION</span>{" "}
            and redeploy — then reprint.
          </li>
        </ul>
      </Card>
    </div>
  );
}
