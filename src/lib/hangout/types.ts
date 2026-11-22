export const PRICE_TIERS = [0, 1, 2, 3, 4] as const; // 0 = free
export type PriceTier = (typeof PRICE_TIERS)[number];
export type Budget = PriceTier; // same 0–4 scale
export const MAX_TIER = 4;
export const DURATION_MIN = { min: 30, max: 240, default: 90 } as const;
export const TRAVEL_MIN = { min: 5, max: 90 } as const;
export const MAX_PLAN_OPTIONS = 20;
export const GROUP_REROLL_POOL = 3;
export const MIN_SUBMITTED_TO_LOCK = 2;

export type IsoDate = string; // "YYYY-MM-DD", Montreal calendar date
export type WallTime = { hour: number; minute: number }; // 0–23, 0–59
export type Interval = { readonly startMs: number; readonly endMs: number }; // half-open, epoch ms
export type LatLng = { readonly lat: number; readonly lng: number };

export type HangoutStatus = "collecting" | "locking" | "locked" | "final" | "no_plan";
export type VenueSource = "live" | "fallback";
export type Season = "winter" | "summer";

// Deliberately has NO name field: the solver cannot leak names.
export type MemberPrefs = {
  readonly memberId: string;
  readonly budget: Budget | null; // null = no budget limit (A-6)
  readonly freeFrom: string; // "HH:MM" or "HH:MM:SS" (Postgres time)
  readonly freeTo: string; // <= freeFrom means it crosses midnight
  readonly maxTravelMin: number | null; // null = no travel limit
  readonly origin: LatLng | null; // null = use the hangout area
};

export type DayTime = { day: 0 | 1 | 2 | 3 | 4 | 5 | 6; hour: number; minute: number }; // 0 = Sunday (Places convention)
export type OpeningPeriod = { open: DayTime; close: DayTime | null }; // close null = open 24 h
export type OpeningHours = { periods: readonly OpeningPeriod[] }; // shape proposed to D (A-9)

export type Venue = {
  readonly venueId: string;
  readonly placeId: string;
  readonly name: string;
  readonly category: string;
  readonly priceTier: PriceTier | null;
  readonly location: LatLng;
  readonly hours: OpeningHours | null;
  readonly isOutdoor: boolean;
  readonly season: Season | null;
  readonly rating: number | null;
  readonly mapsUrl: string | null;
};

export type WeatherHour = {
  readonly startsAt: string; // ISO-8601 UTC instant of the hour start
  readonly temperatureC: number | null;
  readonly precipProbability: number | null; // 0–100
  readonly weatherCode: number | null; // WMO code (Open-Meteo)
};
export type SlotWeather = {
  tempC: number | null;
  precipProb: number | null;
  code: number | null;
  summary: string;
};

export type SolverOptions = {
  readonly winterVenueWeatherExemption: boolean; // spec §11.2, PENDING, default false
  readonly maxOptions: number; // default MAX_PLAN_OPTIONS
  readonly distinctVenues: boolean; // default true (A-16)
  readonly notBefore: Date | null; // drop starts earlier than this (A-13)
};
export const DEFAULT_SOLVER_OPTIONS: SolverOptions = {
  winterVenueWeatherExemption: false,
  maxOptions: MAX_PLAN_OPTIONS,
  distinctVenues: true,
  notBefore: null,
};

export type SolverInput = {
  readonly date: IsoDate;
  readonly durationMin: number;
  readonly areaCenter: LatLng;
  readonly members: readonly MemberPrefs[];
  readonly venues: readonly Venue[];
  readonly weather: readonly WeatherHour[] | null; // null = forecast unavailable
  readonly options: SolverOptions;
};

export type PlanOption = {
  readonly rank: number;
  readonly venueId: string;
  readonly startAt: string;
  readonly endAt: string; // ISO UTC
  readonly score: number;
  readonly compromise: string;
  readonly weather: SlotWeather | null;
  readonly hoursUnknown: boolean;
};

export type SolverResult =
  | { kind: "plan"; options: readonly PlanOption[] }
  | { kind: "no_plan"; reason: "no_time"; outlierMemberIds: readonly string[] }
  | { kind: "no_plan"; reason: "no_venue" };

// Function contracts (A builds against these)
export type CapabilityAuth = { code: string; token: string };
export type LockRequest = CapabilityAuth;
export type LockResponse =
  | { status: "locked"; venueSource: VenueSource }
  | { status: "no_plan"; reason: "no_time"; outliers: readonly string[] } // host-only names
  | { status: "no_plan"; reason: "no_venue" };
export type VoteRerollRequest = CapabilityAuth & { planIndex: number };
export type VoteRerollResponse = {
  planIndex: number;
  groupRerollsUsed: number;
  votes: number;
  threshold: number;
  advanced: boolean;
  isLast: boolean;
};
export type HostRerollRequest = CapabilityAuth & { planIndex: number };
export type HostRerollResponse = { planIndex: number; isLast: boolean };
export type FinalizeRequest = CapabilityAuth;
export type FinalizeResponse = { status: "final" };
export type ReopenRequest = CapabilityAuth;
export type ReopenResponse = { status: "collecting" };

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "NOT_HOST"
  | "NOT_ELIGIBLE"
  | "INVALID_INPUT"
  | "WRONG_STATUS"
  | "NOT_ENOUGH_SUBMITTED"
  | "ALREADY_LOCKING"
  | "STALE_PLAN"
  | "LAST_OPTION"
  | "GROUP_REROLLS_USED"
  | "INTERNAL";
export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: { code: ApiErrorCode; message: string } };

// Provider ports, implemented by D (places.ts, weather.ts); C tests with fakes
export interface VenueProvider {
  find(q: {
    center: LatLng;
    radiusKm: number;
    categories: readonly string[];
  }): Promise<{ venues: readonly Venue[]; source: VenueSource }>;
}
export interface WeatherProvider {
  hourly(q: { center: LatLng; date: IsoDate }): Promise<readonly WeatherHour[] | null>;
}
