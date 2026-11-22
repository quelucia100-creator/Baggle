import { z } from "zod";

export const mapPointSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});
export type MapPoint = z.infer<typeof mapPointSchema>;
export type MapDestination = MapPoint & { name: string };

export function memberInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((word) => Array.from(word)[0] ?? "")
      .join("")
      .toLocaleUpperCase()
      .slice(0, 2) || "?"
  );
}

export const memberTones = ["vista", "tangerine", "sage", "chartreuse", "apricot"] as const;
export const memberTone = (index: number) => memberTones[index % memberTones.length] ?? "vista";

export const routeResultSchema = z.object({
  revision: z.number().int(),
  destination: mapPointSchema,
  routes: z
    .array(
      z.object({
        memberId: z.string(),
        origin: mapPointSchema,
        encodedPolyline: z.string().min(1).max(100000),
        distanceMetres: z.number().finite().nonnegative(),
        durationSeconds: z.number().finite().nonnegative(),
      }),
    )
    .max(10),
  unavailable: z.number().int().min(0).max(10),
});
export type JourneyRoutes = z.infer<typeof routeResultSchema>;

export const googleRouteSchema = z.object({
  routes: z
    .array(
      z.object({
        distanceMeters: z.number().finite().nonnegative().default(0),
        duration: z
          .string()
          .regex(/^\d+(\.\d+)?s$/)
          .transform((value) => Number(value.slice(0, -1))),
        polyline: z.object({ encodedPolyline: z.string().min(1).max(100000) }),
      }),
    )
    .max(5),
});

export function routeMatchesDestination(routes: JourneyRoutes, point: MapPoint) {
  return routes.destination.lat === point.lat && routes.destination.lng === point.lng;
}
