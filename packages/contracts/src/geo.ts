import { z } from "zod";

export const Latitude = z.number().min(-90).max(90);
export const Longitude = z.number().min(-180).max(180);

/** Raw device fix. Only ever sent client -> server, never rebroadcast. */
export const GeoFix = z.object({
  lat: Latitude,
  lng: Longitude,
  /** Horizontal accuracy radius in metres, as reported by the device. */
  accuracyM: z.number().positive().max(10_000),
  /** Client clock, ms epoch. Server never trusts it; used only for sanity checks. */
  clientTs: z.number().int().nonnegative(),
});
export type GeoFix = z.infer<typeof GeoFix>;

/**
 * Coarse position shared with party members: a grid-cell index, never a coordinate.
 * Cell size is fixed server-side (see docs/security.md, PRIV-3).
 */
export const CoarseCell = z.object({
  cx: z.number().int(),
  cy: z.number().int(),
});
export type CoarseCell = z.infer<typeof CoarseCell>;

export const BBox = z.tuple([Longitude, Latitude, Longitude, Latitude]); // [w, s, e, n]
export type BBox = z.infer<typeof BBox>;
