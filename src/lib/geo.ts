import {
  GEOFENCE_MAX_ACCURACY_M,
  OFFICE_CONFIGURED,
  OFFICE_LAT,
  OFFICE_LNG,
  OFFICE_RADIUS_M,
} from "@/lib/constants";

export type GeoFailure = "location_missing" | "location_inaccurate" | "outside_geofence" | "geo_unconfigured";

export interface GeoResult {
  ok: boolean;
  /** Metres from the office centre, or null when there is nothing to measure. */
  distanceM: number | null;
  code?: GeoFailure;
  message?: string;
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GeoInput {
  lat?: number;
  lng?: number;
  accuracy?: number;
}

/**
 * Is this phone at the office?
 *
 * `required` fails closed when no office coordinates are configured — a
 * static QR carries no presence proof of its own, so the geofence has to.
 */
export function checkGeofence(input: GeoInput, opts: { required?: boolean } = {}): GeoResult {
  const required = opts.required ?? false;

  if (!OFFICE_CONFIGURED) {
    if (required) {
      return {
        ok: false,
        distanceM: null,
        code: "geo_unconfigured",
        message: "office location is not configured on the server",
      };
    }
    return { ok: true, distanceM: null };
  }

  const lat = Number(input.lat);
  const lng = Number(input.lng);
  const accuracy = input.accuracy != null ? Number(input.accuracy) : undefined;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      ok: false,
      distanceM: null,
      code: "location_missing",
      message: "location unavailable — enable location access and retry",
    };
  }

  // A fix this coarse says nothing about where the phone is.
  if (accuracy != null && Number.isFinite(accuracy) && accuracy > GEOFENCE_MAX_ACCURACY_M) {
    return {
      ok: false,
      distanceM: null,
      code: "location_inaccurate",
      message: `location is not precise enough (±${Math.round(accuracy)}m) — move outside and retry`,
    };
  }

  const distanceM = haversineMeters(lat, lng, OFFICE_LAT, OFFICE_LNG);
  if (distanceM > OFFICE_RADIUS_M) {
    return {
      ok: false,
      distanceM: Math.round(distanceM),
      code: "outside_geofence",
      message: "scan outside office area",
    };
  }

  return { ok: true, distanceM: Math.round(distanceM) };
}
