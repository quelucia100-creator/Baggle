import { DEFAULT_SOLVER_OPTIONS, type MemberPrefs, type SolverInput, type Venue } from "./types";

export const testArea = { lat: 0, lng: 0 } as const;

export function member(memberId: string, overrides: Partial<MemberPrefs> = {}): MemberPrefs {
  return {
    memberId,
    budget: 2,
    freeFrom: "18:00",
    freeTo: "22:00",
    maxTravelMin: null,
    origin: null,
    ...overrides,
  };
}

export function venue(venueId: string, overrides: Partial<Venue> = {}): Venue {
  return {
    venueId,
    placeId: venueId,
    name: venueId,
    category: "cafe",
    priceTier: 2,
    location: testArea,
    hours: null,
    isOutdoor: false,
    season: null,
    rating: 4,
    mapsUrl: null,
    ...overrides,
  };
}

export function solverInput(overrides: Partial<SolverInput> = {}): SolverInput {
  return {
    date: "2026-07-17",
    durationMin: 90,
    areaCenter: testArea,
    members: [member("a"), member("b")],
    venues: [venue("cafe")],
    weather: null,
    ...overrides,
    options: { ...DEFAULT_SOLVER_OPTIONS, ...overrides.options },
  };
}
