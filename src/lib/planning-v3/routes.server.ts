import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { Point } from "./schema";
import type { Route, RouteProvider, RouteQuery } from "./travel";

const url = "https://connector-gateway.lovable.dev/google_maps/routes";
export class PlanningProviderError extends Error {}
const modes = { walk: "WALK", drive: "DRIVE", transit: "TRANSIT", bike: "BICYCLE" };
const iso = (at: number) => new Date(at).toISOString();
const pointKey = ({ lat, lng }: Point) => `${lat},${lng}`;
const waypoint = ({ lat, lng }: Point) => ({
  location: { latLng: { latitude: lat, longitude: lng } },
});
const duration = z
  .string()
  .regex(/^\d+(\.\d{1,9})?s$/)
  .transform((s) => Math.ceil(Number(s.slice(0, -1)) * 1000))
  .refine((ms) => ms > 0 && ms <= 3 * 60 * 60_000);
const matrixElement = z.object({
  originIndex: z.number().int().nonnegative().default(0),
  destinationIndex: z.number().int().nonnegative().default(0),
  status: z.object({ code: z.number().default(0) }).default({}),
  condition: z.literal("ROUTE_EXISTS"),
  duration,
  fallbackInfo: z.unknown().optional(),
});
const routeResponse = z.object({
  routes: z.array(z.object({ duration })),
  fallbackInfo: z.unknown().optional(),
});
const transitResponse = z.object({
  routes: z.array(
    z.object({
      duration,
      legs: z.array(
        z.object({
          steps: z.array(
            z.object({
              travelMode: z.string(),
              staticDuration: duration.optional(),
              transitDetails: z
                .object({
                  stopDetails: z.object({
                    departureTime: z.string().datetime(),
                    arrivalTime: z.string().datetime(),
                  }),
                })
                .optional(),
            }),
          ),
        }),
      ),
    }),
  ),
  fallbackInfo: z.unknown().optional(),
});

type Pending = { query: RouteQuery; resolve: (route: Route | null) => void };
type Options = {
  key?: string;
  gatewayToken?: string;
  request?: typeof fetch;
  now?: () => number;
  maxCalls?: number;
  maxElements?: number;
  deadlineMs?: number;
};

export function googleRoutes({
  key,
  gatewayToken,
  request = fetch,
  now = Date.now,
  maxCalls = 96,
  maxElements = 480,
  deadlineMs = 15_000,
}: Options): RouteProvider & { readonly failure: string | null } {
  const deadline = now() + deadlineMs;
  let calls = 0;
  let elements = 0;
  let stop = false;
  let limited = false;
  let failure: string | null = null;
  let scheduled = false;
  let pending: Pending[] = [];
  let inFlight = 0;
  const waiting: (() => void)[] = [];

  async function limitedPost(path: string, mask: string, body: object, count: number) {
    if (inFlight >= 8) await new Promise<void>((resolve) => waiting.push(resolve));
    else inFlight++;
    try {
      return await post(path, mask, body, count);
    } finally {
      const next = waiting.shift();
      if (next) next();
      else inFlight--;
    }
  }

  async function post(path: string, mask: string, body: object, count: number): Promise<unknown> {
    if (!key || !gatewayToken || stop) return null;
    if (now() >= deadline || calls >= maxCalls || elements + count > maxElements) {
      limited = true;
      return null;
    }
    calls++;
    elements += count;
    try {
      const response = await request(url + path, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(Math.max(1, Math.min(2200, deadline - now()))),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gatewayToken}`,
          "X-Connection-Api-Key": key,
          "X-Goog-FieldMask": mask,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const body = await response.text();
        console.error(`Event routing failed [${response.status}]: ${body}`);
        if ([401, 403, 429, 503].includes(response.status)) stop = true;
        if (response.status === 403) {
          if (body.includes("API_KEY_HTTP_REFERRER_BLOCKED"))
            failure = "Google Maps server key is referrer-restricted (403). In Google Cloud Console, set the server key's application restrictions to None or IP addresses.";
          else if (body.includes("API_KEY_SERVICE_BLOCKED"))
            failure = "Google Maps server key does not allow Routes (403). In Google Cloud Console, enable Routes API and add it to the server key's allowed APIs.";
          else failure = "Google Maps denied event travel checks (403). Check the connection's permissions before trying again.";
        } else if (response.status === 401)
          failure = "Google Maps connection needs authorization (401). Reconnect it before trying again.";
        else failure = `Event travel checks are unavailable (${response.status}). Please try again later; your answers are saved.`;
        return null;
      }
      return await response.json();
    } catch {
      failure = "Event travel checks could not be reached. Please try again; your answers are saved.";
      return null;
    }
  }

  function timing(query: RouteQuery) {
    if (query.mode === "transit")
      return query.timing === "arrive"
        ? { arrivalTime: iso(query.at) }
        : { departureTime: iso(query.at) };
    if (query.mode === "drive")
      return {
        departureTime: iso(query.timing === "arrive" ? query.earliest : query.at),
        routingPreference: "TRAFFIC_AWARE",
      };
    return {};
  }

  function interval(q: RouteQuery, ms: number): Route {
    if (q.timing === "depart") return { start: q.at, end: q.at + ms };
    if (q.mode === "drive") return { start: q.earliest, end: q.earliest + ms };
    return { start: q.at - ms, end: q.at };
  }

  async function timedTransit(q: RouteQuery, matrixMs: number): Promise<Route | null> {
    const result = transitResponse.safeParse(
      await limitedPost(
        "/directions/v2:computeRoutes",
        "routes.duration,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails.stopDetails,fallbackInfo",
        {
          origin: waypoint(q.from),
          destination: waypoint(q.to),
          travelMode: "TRANSIT",
          ...timing(q),
        },
        1,
      ),
    );
    if (!result.success || result.data.fallbackInfo) return null;
    const route = result.data.routes[0];
    if (!route) return null;
    const steps = route.legs.flatMap((leg) => leg.steps);
    const first = steps.findIndex((step) => step.travelMode === "TRANSIT");
    const reversedIndex = [...steps].reverse().findIndex((step) => step.travelMode === "TRANSIT");
    const last = steps.length - reversedIndex - 1;
    if (first < 0) return null;
    const access = steps.slice(0, first);
    const egress = steps.slice(last + 1);
    if ([...access, ...egress].some((step) => step.travelMode !== "WALK" || !step.staticDuration))
      return null;
    let lastArrival = 0;
    for (const step of steps.filter((step) => step.travelMode === "TRANSIT")) {
      const detail = step.transitDetails?.stopDetails;
      if (!detail) return null;
      const departure = Date.parse(detail.departureTime);
      const arrival = Date.parse(detail.arrivalTime);
      if (departure < lastArrival || arrival <= departure) return null;
      lastArrival = arrival;
    }
    const start =
      Date.parse(steps[first]!.transitDetails!.stopDetails.departureTime) -
      access.reduce((sum, step) => sum + step.staticDuration!, 0);
    const end = lastArrival + egress.reduce((sum, step) => sum + step.staticDuration!, 0);
    const durationMs = Math.max(matrixMs, route.duration, end - start);
    if (q.timing === "arrive") {
      return end <= q.at ? { start: Math.min(start, end - durationMs), end } : null;
    }
    return start >= q.at ? { start: q.at, end: Math.max(end, q.at + durationMs) } : null;
  }

  const staticRoutes = new Map<string, Promise<number | null>>();
  const timed = new Map<string, Promise<Route | null>>();

  function bike(q: RouteQuery) {
    return limitedPost(
      "/directions/v2:computeRoutes",
      "routes.duration,fallbackInfo",
      { origin: waypoint(q.from), destination: waypoint(q.to), travelMode: "BICYCLE" },
      1,
    ).then((data) => {
      const result = routeResponse.safeParse(data);
      return result.success && !result.data.fallbackInfo
        ? (result.data.routes[0]?.duration ?? null)
        : null;
    });
  }

  async function matrix(batch: Pending[]) {
    const q = batch[0]!.query;
    const outbound = q.timing === "arrive";
    const distinct = (points: Point[]) => [
      ...new Map(points.map((point) => [pointKey(point), point])).values(),
    ];
    const origins = distinct(batch.map((item) => item.query.from));
    const destinations = distinct(batch.map((item) => item.query.to));
    const data = await limitedPost(
      "/distanceMatrix/v2:computeRouteMatrix",
      "originIndex,destinationIndex,status,condition,duration,fallbackInfo",
      {
        origins: origins.map((point) => ({ waypoint: waypoint(point) })),
        destinations: destinations.map((point) => ({ waypoint: waypoint(point) })),
        travelMode: modes[q.mode],
        ...timing(q),
      },
      origins.length * destinations.length,
    );
    const found = new Map<string, number>();
    for (const item of Array.isArray(data) ? data : []) {
      const element = matrixElement.safeParse(item);
      if (element.success && element.data.status.code === 0 && !element.data.fallbackInfo)
        found.set(
          `${element.data.originIndex},${element.data.destinationIndex}`,
          element.data.duration,
        );
    }
    await Promise.all(
      batch.map(async ({ query, resolve }) => {
        const ms = found.get(
          `${origins.findIndex((point) => pointKey(point) === pointKey(query.from))},${destinations.findIndex((point) => pointKey(point) === pointKey(query.to))}`,
        );
        if (!ms) {
          resolve(null);
          return;
        }
        if (query.mode === "transit") {
          resolve(await timedTransit(query, ms));
          return;
        }
        // Recheck the driving estimate at the intended departure, instead of applying old traffic to a later trip.
        if (query.mode === "drive" && outbound && query.at - ms - 60_000 > query.earliest) {
          const revised = { ...query, earliest: query.at - ms - 60_000 };
          const exact = await limitedPost(
            "/distanceMatrix/v2:computeRouteMatrix",
            "status,condition,duration,fallbackInfo",
            {
              origins: [{ waypoint: waypoint(query.from) }],
              destinations: [{ waypoint: waypoint(query.to) }],
              travelMode: "DRIVE",
              ...timing(revised),
            },
            1,
          );
          const element = matrixElement.safeParse(Array.isArray(exact) ? exact[0] : null);
          if (
            element.success &&
            element.data.status.code === 0 &&
            !element.data.fallbackInfo &&
            revised.earliest + element.data.duration <= query.at
          ) {
            resolve(interval(revised, element.data.duration));
            return;
          }
        }
        resolve(interval(query, ms));
      }),
    );
  }

  function enqueue(query: RouteQuery) {
    return new Promise<Route | null>((resolve) => {
      pending.push({ query, resolve });
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        const batches = new Map<string, Pending[]>();
        for (const item of pending) {
          const q = item.query;
          // One common endpoint per batch avoids cross-product costs and caps the matrix at 10 elements.
          const group = JSON.stringify([
            q.mode,
            q.timing,
            timing(q),
            pointKey(q.timing === "arrive" ? q.to : q.from),
          ]);
          const batch = batches.get(group) ?? [];
          batch.push(item);
          batches.set(group, batch);
        }
        pending = [];
        scheduled = false;
        for (const batch of batches.values())
          for (let i = 0; i < batch.length; i += 10) {
            const chunk = batch.slice(i, i + 10);
            void matrix(chunk).catch(() => chunk.forEach((item) => item.resolve(null)));
          }
      });
    });
  }

  return {
    get failure() {
      return failure;
    },
    get limited() {
      return limited;
    },
    async route(query) {
      if (!key || !gatewayToken) return null;
      if (query.mode === "drive" && query.timing === "arrive") {
        query = { ...query, earliest: Math.max(query.earliest, now() + 2_000) };
        if (query.earliest >= query.at) return null;
      }
      if (query.mode === "walk" || query.mode === "bike") {
        const cacheKey = JSON.stringify([query.mode, pointKey(query.from), pointKey(query.to)]);
        let entry = staticRoutes.get(cacheKey);
        if (!entry) {
          entry =
            query.mode === "bike"
              ? bike(query)
              : enqueue({ ...query, at: 0, timing: "depart" }).then((r) =>
                  r ? r.end - r.start : null,
                );
          staticRoutes.set(cacheKey, entry);
        }
        const ms = await entry;
        return ms === null ? null : interval(query, ms);
      }
      const cacheKey = JSON.stringify([
        query.mode,
        query.at,
        query.timing,
        query.earliest,
        pointKey(query.from),
        pointKey(query.to),
      ]);
      let entry = timed.get(cacheKey);
      if (!entry) {
        entry = enqueue(query);
        timed.set(cacheKey, entry);
      }
      return entry;
    },
  };
}
