import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const base = process.env.BETTER_AUTH_URL ?? "";
  return {
    name: "Office Attendance",
    short_name: "Attendance",
    description: "QR check-in/out and leave for the office.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1120",
    theme_color: "#0b1120",
    icons: [
      { src: `${base}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: `${base}/icon-maskable-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: `${base}/icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
