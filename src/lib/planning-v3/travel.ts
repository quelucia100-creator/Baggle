import { MINUTE_MS } from "../planning/tz";
import type { HostConfigV3, Interval, MemberPreferencesV3, Mode, Point } from "./schema";

export type RouteQuery = {
  from: Point;
  to: Point;
  mode: Mode;
  at: number;
  timing: "arrive" | "depart";
  earliest: number;
};
export type Route = { start: number; end: number };
export interface RouteProvider {
  route(query: RouteQuery): Promise<Route | null>;
  limited?: boolean;
}
const TRANSFER = 5 * MINUTE_MS;

export function originFor(p: MemberPreferencesV3, config: HostConfigV3): Point | null {
  return p.origin.lat !== null && p.origin.lng !== null
    ? { lat: p.origin.lat, lng: p.origin.lng }
    : config.area.point;
}

async function leg(provider: RouteProvider, query: RouteQuery): Promise<Route | null> {
  if (query.at < query.earliest) return null;
  if (query.from.lat === query.to.lat && query.from.lng === query.to.lng)
    return { start: query.at, end: query.at };
  try {
    const route = await provider.route(query);
    if (
      !route ||
      !Number.isFinite(route.start) ||
      !Number.isFinite(route.end) ||
      route.start < query.earliest ||
      route.end <= route.start ||
      (query.timing === "arrive" ? route.end > query.at : route.start < query.at)
    )
      return null;
    return route;
  } catch {
    return null;
  }
}

export async function travelForSlot(
  provider: RouteProvider,
  config: HostConfigV3,
  members: { preferences: MemberPreferencesV3; windows: Interval[] }[],
  venue: Point,
  slot: Interval,
): Promise<number[] | null> {
  const arrangement = config.travelArrangement;
  const meeting = arrangement.sharedMeetingPoint;
  const sharedMode = arrangement.sharedMode;
  let sharedOut: Route | null = null;
  let sharedBack: Route | null = null;
  if (arrangement.mode === "together" && meeting && sharedMode) {
    const earliest = Math.max(
      ...members.map(({ preferences, windows }) =>
        Math.max(
          slot.start - preferences.travel.maxOneWayMinutes * MINUTE_MS,
          windows[0]?.start ?? Infinity,
        ),
      ),
    );
    [sharedOut, sharedBack] = await Promise.all([
      leg(provider, {
        from: meeting,
        to: venue,
        mode: sharedMode,
        at: slot.start,
        timing: "arrive",
        earliest,
      }),
      leg(provider, {
        from: venue,
        to: meeting,
        mode: sharedMode,
        at: slot.end,
        timing: "depart",
        earliest: slot.end,
      }),
    ]);
    if (!sharedOut || !sharedBack) return null;
  }
  const travel = await Promise.all(
    members.map(async ({ preferences: p, windows }) => {
      const origin = originFor(p, config);
      if (!origin) return null;
      const cap = p.travel.maxOneWayMinutes * MINUTE_MS;
      const outAt = sharedOut ? sharedOut.start - TRANSFER : slot.start;
      const backAt = sharedBack ? sharedBack.end + TRANSFER : slot.end;
      const earliest = Math.max(windows[0]?.start ?? Infinity, slot.start - cap);
      const alreadyThere = !!sharedOut && p.travel.alreadyAtSharedMeetingPoint;
      const [out, back] = alreadyThere
        ? [
            { start: sharedOut!.start, end: sharedOut!.start },
            { start: sharedBack!.end, end: sharedBack!.end },
          ]
        : await Promise.all([
            leg(provider, {
              from: origin,
              to: meeting ?? venue,
              mode: p.travel.mode,
              at: outAt,
              timing: "arrive",
              earliest,
            }),
            leg(provider, {
              from: meeting ?? venue,
              to: origin,
              mode: p.travel.returnMode ?? p.travel.mode,
              at: backAt,
              timing: "depart",
              earliest: backAt,
            }),
          ]);
      if (!out || !back) return null;
      const outbound = slot.start - out.start;
      const returning = back.end - slot.end;
      if (
        outbound > cap ||
        returning > cap ||
        !windows.some((window) => out.start >= window.start && back.end <= window.end)
      )
        return null;
      return Math.max(outbound, returning) / cap;
    }),
  );
  return travel.every((value): value is number => value !== null) ? travel : null;
}
