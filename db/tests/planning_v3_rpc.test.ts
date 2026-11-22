// Planning V3 RPC acceptance tests. Wire-level (PostgREST) against an ISOLATED loopback backend only.
// Run: PLANNING_V3_DB_TESTS=1 bun test ./db/tests/planning_v3_rpc.test.ts
// Creates synthetic guest parties; prints only aggregate pass/fail. Never targets non-loopback hosts.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const URL_ = process.env["SUPABASE_URL"] ?? "";
const ANON = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const enabled = process.env["PLANNING_V3_DB_TESTS"] === "1" && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_);
const d = enabled ? describe : describe.skip;

let authJwt = "";
type Role = "anon" | "authenticated" | "service";
const hex = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
function headers(role: Role) {
  const key = role === "service" ? SERVICE : ANON;
  const bearer = role === "service" ? SERVICE : role === "authenticated" ? authJwt : ANON;
  const h: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (role !== "anon" || !ANON.startsWith("sb_")) h["Authorization"] = `Bearer ${bearer}`;
  if (role === "service" && SERVICE.startsWith("sb_")) delete h["Authorization"];
  return h;
}
async function rpc(fn: string, body: unknown, role: Role = "anon") {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: headers(role), body: JSON.stringify(body) });
  const text = await r.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: r.ok, status: r.status, data, text };
}
const plan = (action: string, code: string, token: string, payload: unknown = {}, role: Role = "anon") =>
  rpc("party_plan", { p_action: action, p_code: code, p_token: token, p_payload: payload }, role);
async function ok(p: Promise<{ ok: boolean; data: any; text: string }>) {
  const r = await p;
  if (!r.ok) throw new Error(`expected success (${r.text.slice(0, 120)})`);
  return r.data;
}
async function fails(p: Promise<{ ok: boolean; text: string }>, msg?: string) {
  const r = await p;
  expect(r.ok).toBe(false);
  if (msg) expect(r.text).toContain(msg);
  return r.text;
}

const mtl = (offset: number) => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montreal", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const base = new Date(`${parts}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + offset);
  return base.toISOString().slice(0, 10);
};
// Montreal midnight of a date (EST/EDT aware) as UTC ISO.
function mtlMidnight(date: string) {
  for (const off of [5, 4]) {
    const t = new Date(`${date}T0${off}:00:00Z`);
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montreal", hour: "2-digit", hourCycle: "h23" }).format(t);
    if (local === "00") return t;
  }
  throw new Error("tz");
}
const at = (date: string, hours: number) => new Date(mtlMidnight(date).getTime() + hours * 3600_000).toISOString().replace(".000Z", "Z");

const config = (o: Partial<any> = {}) => ({
  version: 3,
  dateSelection: { mode: "future_dates", selectionStyle: "single", candidateDates: [mtl(1)], range: null },
  duration: { mode: "fixed", minMinutes: 60, maxMinutes: 60 },
  area: { mode: "optimize_for_group", label: null, point: null, isStrict: false },
  travelArrangement: { mode: "independent", sharedMeetingPoint: null, sharedMode: null },
  rules: { under18Friendly: false, freeOnly: false, alcoholPolicy: "allow", requiredAccessibility: [], dietaryHardRequirements: [] },
  ...o,
});
const prefs = (dates: string[], o: Partial<any> = {}) => ({
  version: 3,
  vibes: ["chill_cozy"],
  likedActivities: ["arts_culture"],
  excludedActivities: [],
  budget: { currency: "CAD", preferredMinCad: 0, preferredMaxCad: 20, hardMaxCad: 25, explicitlyUnlimited: false },
  availability: { mode: "calendar", tonight: null, days: dates.map((date) => ({ date, confirmed: true, busyIntervals: [] })) },
  origin: { source: "manual", label: "Montreal", lat: 45.5123, lng: -73.5678, accuracy: "approximate" },
  travel: { mode: "walk", maxOneWayMinutes: 30, returnMode: null, alreadyAtSharedMeetingPoint: false },
  accessibilityHardRequirements: [],
  dietaryHardRequirements: [],
  optionalNote: null,
  ...o,
});
const option = (date: string, o: Partial<any> = {}, v: Partial<any> = {}) => ({
  version: 3,
  venue: {
    placeId: "curated:test-1", name: "Synthetic Gallery", category: "arts_culture", priceTier: null,
    location: { lat: 45.5, lng: -73.57 }, mapsUrl: "https://maps.google.com/?q=45.5,-73.57", outdoor: false,
    address: "1 Synthetic St, Montreal", source: "curated", sourceTimestamp: "2026-11-01T00:00:00Z",
    attribution: [{ name: "Baggel curated", url: null }], cost: null, bookingRequired: "unknown", bookingUrl: null,
    accessibilityVerified: false, score: 99, secretOrigin: { lat: 1, lng: 2 }, ...v,
  },
  date, startAt: at(date, 14), endAt: at(date, 15), durationMinutes: 60, timeZone: "America/Montreal",
  routeVerifiability: "provider_verified", compromise: "2 members exceeded budget", hoursUnknown: false,
  weather: null, warnings: ["cost_unknown"], score: 0.93, outlierIds: ["x"], ...o,
});

async function party(n = 2) {
  const tokens = Array.from({ length: n }, hex);
  const host = await ok(rpc("party_access", { p_action: "create", p_code: "", p_token: tokens[0], p_name: "Host" }));
  const ids = [host.selfId as string];
  for (let i = 1; i < n; i++) ids.push((await ok(rpc("party_access", { p_action: "join", p_code: host.code, p_token: tokens[i], p_name: `G${i}` }))).selfId);
  return { code: host.code as string, tokens, ids };
}
async function v3Locked(n = 2) {
  const p = await party(n);
  const date = mtl(1);
  await ok(plan("configure", p.code, p.tokens[0]!, config()));
  for (const t of p.tokens) await ok(plan("save", p.code, t, prefs([date])));
  const lock = await ok(plan("begin_lock", p.code, p.tokens[0]!));
  return { ...p, date, lease: lock.lease as string, lock };
}

const results: { name: string; pass: boolean }[] = [];
const t = (name: string, fn: () => Promise<void>, timeout = 20000) =>
  test(name, async () => { try { await fn(); results.push({ name, pass: true }); } catch (e) { results.push({ name, pass: false }); throw e; } }, timeout);

d("planning v3 rpc (isolated loopback backend)", () => {
  beforeAll(async () => {
    const email = `v3-${hex().slice(0, 10)}@example.com`, password = hex();
    await fetch(`${URL_}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" }, body: JSON.stringify({ email, password, email_confirm: true }) });
    const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    authJwt = ((await r.json()) as any).access_token ?? "";
    expect(authJwt.length).toBeGreaterThan(20);
  });
  afterAll(() => {
    const passed = results.filter((r) => r.pass).length;
    console.log(`PLANNING_V3_SUMMARY passed=${passed} failed=${results.length - passed} total=${results.length}`);
  });

  t("V2 bootstrap + V2 wire lifecycle unchanged for anon and authenticated", async () => {
    const p = await party(2);
    for (const role of ["anon", "authenticated"] as Role[]) {
      const s = await ok(plan("read", p.code, p.tokens[0]!, {}, role));
      expect(s.schemaVersion).toBe(2);
      expect(s.status).toBe("collecting");
      expect(Object.keys(s.config).sort()).toEqual(["area", "areaLabel", "category", "date", "durationMin"]);
    }
    await ok(plan("configure", p.code, p.tokens[0]!, { date: mtl(1), durationMin: 60, areaLabel: "Downtown", areaLat: 45.5, areaLng: -73.57, category: "park" }, "authenticated"));
    for (const tk of p.tokens) await ok(plan("save", p.code, tk, { budget: 2, freeFrom: "10:00", freeTo: "20:00", maxTravelMin: 30 }));
    const lock = await ok(plan("begin_lock", p.code, p.tokens[0]!));
    expect(lock.acquired).toBe(true);
    const snap = await ok(rpc("party_plan_snapshot", { p_code: p.code, p_lease: lock.lease }, "service"));
    expect(snap.schemaVersion).toBeUndefined();
    expect(snap.members.length).toBe(2);
    const legacy = { venue: { placeId: "p", name: "Park", category: "park", priceTier: 0, location: { lat: 45.5, lng: -73.57 }, mapsUrl: "https://maps.google.com", outdoor: true }, startAt: at(mtl(1), 14), endAt: at(mtl(1), 15), hoursUnknown: false, weather: null, score: 5 };
    expect(await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: lock.lease, p_options: [legacy, legacy], p_outliers: [], p_source: "fallback", p_failed: false }, "service"))).toBe(true);
    const s = await ok(plan("read", p.code, p.tokens[1]!));
    expect(s.status).toBe("locked");
    expect(s.plan.score).toBeUndefined();
    expect(s.plan.compromise).toBe("Review this option");
    await ok(plan("vote", p.code, p.tokens[1]!, { revision: s.revision }, "authenticated"));
    expect((await ok(plan("read", p.code, p.tokens[0]!))).planIndex).toBe(1);
  });

  t("V2 payloads rejected after V3 opt-in; V3 payloads rejected on V2 party", async () => {
    const p = await party(2);
    await fails(plan("save", p.code, p.tokens[1]!, prefs([mtl(1)])));
    await ok(plan("configure", p.code, p.tokens[0]!, config()));
    await fails(plan("save", p.code, p.tokens[1]!, { budget: 2, freeFrom: "10:00", freeTo: "20:00", maxTravelMin: 30 }), "Invalid planning preferences.");
    await fails(plan("configure", p.code, p.tokens[0]!, { date: mtl(1), durationMin: 60, areaLabel: "x", areaLat: 1, areaLng: 1, category: "park" }), "Invalid planning configuration.");
  });

  t("configure: host-only, all date modes, server-materialized dates", async () => {
    const p = await party(2);
    await fails(plan("configure", p.code, p.tokens[1]!, config()), "Only the host");
    const today = await ok(plan("configure", p.code, p.tokens[0]!, config({ dateSelection: { mode: "today_tonight", selectionStyle: null, candidateDates: [], range: null } })));
    expect(today.schemaVersion).toBe(3);
    expect(today.config.dateSelection.candidateDates).toEqual([mtl(0)]);
    const multi = await ok(plan("configure", p.code, p.tokens[0]!, config({ dateSelection: { mode: "future_dates", selectionStyle: "multiple", candidateDates: [mtl(5), mtl(2), mtl(14)], range: null } })));
    expect(multi.config.dateSelection.candidateDates).toEqual([mtl(2), mtl(5), mtl(14)]);
    const range = await ok(plan("configure", p.code, p.tokens[0]!, config({ dateSelection: { mode: "future_dates", selectionStyle: "range", candidateDates: [], range: { startDate: mtl(1), endDate: mtl(3) } } })));
    expect(range.config.dateSelection.candidateDates).toEqual([mtl(1), mtl(2), mtl(3)]);
    const best = await ok(plan("configure", p.code, p.tokens[0]!, config({ dateSelection: { mode: "best_day", selectionStyle: "range", candidateDates: [], range: { startDate: mtl(1), endDate: mtl(14) } } })));
    expect(best.config.dateSelection.candidateDates.length).toBe(14);
  });

  t("configure: invalid shapes rejected with generic error and no partial write", async () => {
    const p = await party(2);
    const base = await ok(plan("configure", p.code, p.tokens[0]!, config()));
    const bad: any[] = [
      config({ dateSelection: { mode: "future_dates", selectionStyle: "single", candidateDates: [mtl(15)], range: null } }),
      config({ dateSelection: { mode: "future_dates", selectionStyle: "single", candidateDates: [mtl(-1)], range: null } }),
      config({ dateSelection: { mode: "future_dates", selectionStyle: "single", candidateDates: ["2026-02-30"], range: null } }),
      config({ dateSelection: { mode: "future_dates", selectionStyle: "multiple", candidateDates: [mtl(2), mtl(2)], range: null } }),
      config({ dateSelection: { mode: "best_day", selectionStyle: "range", candidateDates: [], range: { startDate: mtl(0), endDate: mtl(14) } } }),
      config({ dateSelection: { mode: "best_day", selectionStyle: "range", candidateDates: [mtl(4)], range: { startDate: mtl(1), endDate: mtl(3) } } }),
      config({ dateSelection: { mode: "best_day", selectionStyle: null, candidateDates: [], range: null } }),
      config({ duration: { mode: "fixed", minMinutes: 60, maxMinutes: 90 } }),
      config({ duration: { mode: "fixed", minMinutes: 45, maxMinutes: 45 } }),
      config({ duration: { mode: "flexible", minMinutes: 30, maxMinutes: 270 } }),
      config({ duration: { mode: "fixed", minMinutes: "60", maxMinutes: 60 } }),
      config({ area: { mode: "host_area", label: null, point: null, isStrict: false } }),
      config({ area: { mode: "optimize_for_group", label: null, point: null, isStrict: true } }),
      config({ travelArrangement: { mode: "together", sharedMeetingPoint: null, sharedMode: "bike" } }),
      config({ rules: { under18Friendly: "yes", freeOnly: false, alcoholPolicy: "allow", requiredAccessibility: [], dietaryHardRequirements: [] } }),
      config({ rules: { under18Friendly: false, freeOnly: false, alcoholPolicy: "beer", requiredAccessibility: [], dietaryHardRequirements: [] } }),
      { ...config(), extra: 1 },
      { ...config(), version: 2 },
      [],
    ];
    for (const b of bad) await fails(plan("configure", p.code, p.tokens[0]!, b), "Invalid planning configuration.");
    const after = await ok(plan("read", p.code, p.tokens[0]!));
    expect(after.revision).toBe(base.revision);
    expect(after.config).toEqual(base.config);
    const same = await ok(plan("configure", p.code, p.tokens[0]!, config()));
    expect(same.revision).toBe(base.revision);
    const together = await ok(plan("configure", p.code, p.tokens[0]!, config({ area: { mode: "host_area", label: "Plateau", point: { lat: 45.52, lng: -73.58 }, isStrict: true }, travelArrangement: { mode: "together", sharedMeetingPoint: { lat: 45.5, lng: -73.56, label: "Berri-UQAM" }, sharedMode: "bike" }, rules: { under18Friendly: true, freeOnly: true, alcoholPolicy: "alcohol_free_only", requiredAccessibility: ["step_free"], dietaryHardRequirements: ["peanut_free"] } })));
    expect(together.config.travelArrangement.sharedMode).toBe("bike");
    expect(together.config.rules.requiredAccessibility).toEqual(["step_free"]);
  });

  t("save: caller-only privacy; host sees booleans only; no overwrite of others", async () => {
    const p = await party(3);
    const date = mtl(1);
    await ok(plan("configure", p.code, p.tokens[0]!, config()));
    await ok(plan("save", p.code, p.tokens[1]!, prefs([date], { optionalNote: "SECRET-NOTE-G1", budget: { currency: "CAD", preferredMinCad: 0, preferredMaxCad: 430, hardMaxCad: 435, explicitlyUnlimited: false }, dietaryHardRequirements: ["shellfish_allergy"] })));
    const hostView = await plan("read", p.code, p.tokens[0]!);
    for (const s of ["SECRET-NOTE-G1", "435", "shellfish_allergy", "45.51"]) expect(hostView.text.includes(s)).toBe(false);
    expect(hostView.data.selfPreferences).toBeNull();
    expect(hostView.data.members.map((m: any) => Object.keys(m).sort().join())).toEqual(["id,submitted", "id,submitted", "id,submitted"]);
    expect(hostView.data.members.find((m: any) => m.id === p.ids[1]).submitted).toBe(true);
    const g2 = await plan("read", p.code, p.tokens[2]!, {}, "authenticated");
    expect(g2.text.includes("SECRET-NOTE-G1")).toBe(false);
    await ok(plan("save", p.code, p.tokens[2]!, prefs([date])));
    const g1 = await ok(plan("read", p.code, p.tokens[1]!));
    expect(g1.selfPreferences.optionalNote).toBe("SECRET-NOTE-G1");
    expect(g1.selfPreferences.origin.lat).toBe(45.51);
    await fails(rpc("party_access", { p_action: "read", p_code: p.code, p_token: "0".repeat(64) }));
    await fails(plan("read", p.code, "nothex"));
  });

  t("save: field validation matrix", async () => {
    const p = await party(2);
    const [d1, d2] = [mtl(1), mtl(2)];
    await ok(plan("configure", p.code, p.tokens[0]!, config({ dateSelection: { mode: "future_dates", selectionStyle: "multiple", candidateDates: [d1, d2], range: null } })));
    const tk = p.tokens[1]!;
    const days = (b1: any[] = [], c2 = true) => ({ mode: "calendar", tonight: null, days: [{ date: d1, confirmed: true, busyIntervals: b1 }, { date: d2, confirmed: c2, busyIntervals: [] }] });
    const P = (o: any) => prefs([d1, d2], { availability: days(), ...o });
    const bad = [
      P({ vibes: [] }), P({ vibes: ["chill_cozy", "creative", "competitive"] }), P({ vibes: ["chill_cozy", "chill_cozy"] }), P({ vibes: ["sleepy"] }),
      P({ likedActivities: ["games"], excludedActivities: ["games"] }), P({ excludedActivities: ["surprise"] }),
      P({ budget: { currency: "CAD", preferredMinCad: 0, preferredMaxCad: 20, hardMaxCad: null, explicitlyUnlimited: false } }),
      P({ budget: { currency: "CAD", preferredMinCad: 0, preferredMaxCad: 20, hardMaxCad: 15, explicitlyUnlimited: false } }),
      P({ budget: { currency: "CAD", preferredMinCad: 0, preferredMaxCad: 20, hardMaxCad: 30, explicitlyUnlimited: true } }),
      P({ budget: { currency: "CAD", preferredMinCad: 3, preferredMaxCad: 20, hardMaxCad: 30, explicitlyUnlimited: false } }),
      P({ budget: { currency: "USD", preferredMinCad: 0, preferredMaxCad: 20, hardMaxCad: 30, explicitlyUnlimited: false } }),
      P({ budget: { currency: "CAD", preferredMinCad: 30, preferredMaxCad: 20, hardMaxCad: 30, explicitlyUnlimited: false } }),
      P({ travel: { mode: "walk", maxOneWayMinutes: 4, returnMode: null, alreadyAtSharedMeetingPoint: false } }),
      P({ travel: { mode: "walk", maxOneWayMinutes: 91, returnMode: null, alreadyAtSharedMeetingPoint: false } }),
      P({ travel: { mode: "walk", maxOneWayMinutes: "30", returnMode: null, alreadyAtSharedMeetingPoint: false } }),
      P({ travel: { mode: "scooter", maxOneWayMinutes: 30, returnMode: null, alreadyAtSharedMeetingPoint: false } }),
      P({ travel: { mode: "walk", maxOneWayMinutes: 30, returnMode: null, alreadyAtSharedMeetingPoint: true } }),
      P({ origin: { source: "manual", label: "x", lat: 95, lng: 0, accuracy: "approximate" } }),
      P({ origin: { source: "manual", label: "x", lat: 45.5, lng: -73.5, accuracy: "precise_ephemeral" } }),
      P({ origin: { source: "group_area", label: null, lat: null, lng: null, accuracy: "approximate" } }),
      P({ availability: days([{ startAt: at(d1, 10.25), endAt: at(d1, 11) }]) }),
      P({ availability: days([{ startAt: at(d1, 11), endAt: at(d1, 10) }]) }),
      P({ availability: days([{ startAt: at(d1, -1), endAt: at(d1, 1) }]) }),
      P({ availability: days([{ startAt: at(d1, 29), endAt: at(d1, 31) }]) }),
      P({ availability: days([{ startAt: at(d1, 0), endAt: at(d1, 30) }]) }),
      P({ availability: days([{ startAt: "2026-13-01T00:00:00Z", endAt: at(d1, 2) }]) }),
      P({ availability: { mode: "calendar", tonight: null, days: [{ date: d1, confirmed: true, busyIntervals: [] }] } }),
      P({ availability: { mode: "tonight", tonight: { earliestDepartureAt: null, latestReturnAt: null, anytimeFromNow: true, noReturnDeadline: true }, days: [] } }),
      P({ optionalNote: 5 }), P({ dietaryHardRequirements: ["Not A Tag"] }), { ...P({}), extra: true }, "string-payload",
    ];
    for (const b of bad) await fails(plan("save", p.code, tk, b), "Invalid planning preferences.");
    expect((await ok(plan("read", p.code, tk))).selfPreferences).toBeNull();

    // Unconfirmed day => draft saved, not submitted.
    await ok(plan("save", p.code, tk, P({ availability: days([], false) })));
    let s = await ok(plan("read", p.code, p.tokens[0]!));
    expect(s.members.find((m: any) => m.id === p.ids[1]).submitted).toBe(false);
    // Overlapping + overnight red blocks merge; zero budget; bike; unlimited.
    const busy = [{ startAt: at(d1, 22), endAt: at(d1, 25) }, { startAt: at(d1, 9), endAt: at(d1, 10) }, { startAt: at(d1, 9.5), endAt: at(d1, 11) }, { startAt: at(d1, 11), endAt: at(d1, 12) }];
    await ok(plan("save", p.code, tk, P({ availability: days(busy), budget: { currency: "CAD", preferredMinCad: 0, preferredMaxCad: 0, hardMaxCad: 0, explicitlyUnlimited: false }, travel: { mode: "bike", maxOneWayMinutes: 90, returnMode: "transit", alreadyAtSharedMeetingPoint: false } })));
    s = await ok(plan("read", p.code, tk));
    expect(s.selfPreferences.availability.days[0].busyIntervals).toEqual([{ startAt: at(d1, 9), endAt: at(d1, 12) }, { startAt: at(d1, 22), endAt: at(d1, 25) }]);
    expect(s.members.find((m: any) => m.id === p.ids[1]).submitted).toBe(true);
    const rev = s.revision;
    await ok(plan("save", p.code, tk, P({ availability: days(busy), budget: { currency: "CAD", preferredMinCad: 0, preferredMaxCad: 0, hardMaxCad: 0, explicitlyUnlimited: false }, travel: { mode: "bike", maxOneWayMinutes: 90, returnMode: "transit", alreadyAtSharedMeetingPoint: false } })));
    expect((await ok(plan("read", p.code, tk))).revision).toBe(rev);
    await ok(plan("save", p.code, tk, P({ budget: { currency: "CAD", preferredMinCad: 50, preferredMaxCad: 500, hardMaxCad: null, explicitlyUnlimited: true } })));
  });

  t("tonight mode IDC flags and host rules storage", async () => {
    const p = await party(2);
    await ok(plan("configure", p.code, p.tokens[0]!, config({ dateSelection: { mode: "today_tonight", selectionStyle: null, candidateDates: [], range: null }, area: { mode: "host_area", label: "Mile End", point: { lat: 45.52, lng: -73.6 }, isStrict: false } })));
    const tonight = (o: any) => prefs([], { availability: { mode: "tonight", tonight: o, days: [] } });
    await ok(plan("save", p.code, p.tokens[1]!, tonight({ earliestDepartureAt: null, latestReturnAt: null, anytimeFromNow: true, noReturnDeadline: true })));
    const tomorrow6 = at(mtl(0), 30);
    await ok(plan("save", p.code, p.tokens[0]!, tonight({ earliestDepartureAt: null, latestReturnAt: tomorrow6, anytimeFromNow: true, noReturnDeadline: false }), ));
    await fails(plan("save", p.code, p.tokens[0]!, tonight({ earliestDepartureAt: null, latestReturnAt: at(mtl(0), 31), anytimeFromNow: true, noReturnDeadline: false })), "Invalid planning preferences.");
    await fails(plan("save", p.code, p.tokens[0]!, tonight({ earliestDepartureAt: at(mtl(0), 20), latestReturnAt: null, anytimeFromNow: true, noReturnDeadline: true })), "Invalid planning preferences.");
    await fails(plan("save", p.code, p.tokens[0]!, tonight({ earliestDepartureAt: null, latestReturnAt: null, anytimeFromNow: "yes", noReturnDeadline: true })), "Invalid planning preferences.");
    await ok(plan("save", p.code, p.tokens[1]!, tonight({ earliestDepartureAt: null, latestReturnAt: null, anytimeFromNow: true, noReturnDeadline: true, }) && prefs([], { availability: { mode: "tonight", tonight: { earliestDepartureAt: null, latestReturnAt: null, anytimeFromNow: true, noReturnDeadline: true }, days: [] }, origin: { source: "group_area", label: null, lat: null, lng: null, accuracy: "approximate" } })));
    const s = await ok(plan("read", p.code, p.tokens[0]!));
    expect(s.members.every((m: any) => m.submitted)).toBe(true);
  });

  t("precise origin: stored with ≤1h TTL, never shown to others, purged on completion", async () => {
    const p = await party(2);
    const date = mtl(1);
    await ok(plan("configure", p.code, p.tokens[0]!, config()));
    await ok(plan("save", p.code, p.tokens[0]!, prefs([date])));
    await ok(plan("save", p.code, p.tokens[1]!, prefs([date], { origin: { source: "current_location", label: null, lat: 45.501234, lng: -73.567891, accuracy: "precise_ephemeral" } })));
    expect((await plan("read", p.code, p.tokens[0]!)).text.includes("45.501234")).toBe(false);
    expect((await ok(plan("read", p.code, p.tokens[1]!))).selfPreferences.origin.lat).toBe(45.501234);
    const lock = await ok(plan("begin_lock", p.code, p.tokens[0]!));
    const snap = await ok(rpc("party_plan_snapshot", { p_code: p.code, p_lease: lock.lease }, "service"));
    expect(JSON.stringify(snap).includes("45.501234")).toBe(true);
    await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: lock.lease, p_options: [option(date)], p_source: "curated" }, "service"));
    const g = await ok(plan("read", p.code, p.tokens[1]!));
    expect(g.selfPreferences).toBeNull();
    expect(g.members.find((m: any) => m.id === p.ids[1]).submitted).toBe(false);
  });

  t("begin_lock guards: host must submit, ≥2 submissions", async () => {
    const p = await party(3);
    const date = mtl(1);
    await ok(plan("configure", p.code, p.tokens[0]!, config()));
    await ok(plan("save", p.code, p.tokens[1]!, prefs([date])));
    await ok(plan("save", p.code, p.tokens[2]!, prefs([date])));
    await fails(plan("begin_lock", p.code, p.tokens[0]!), "Submit your own preferences");
    await fails(plan("begin_lock", p.code, p.tokens[1]!), "Only the host");
    const q = await party(2);
    await ok(plan("configure", q.code, q.tokens[0]!, config()));
    await ok(plan("save", q.code, q.tokens[0]!, prefs([date])));
    await fails(plan("begin_lock", q.code, q.tokens[0]!), "At least 2 members");
  });

  t("concurrent begin_lock from two sessions yields exactly one lease", async () => {
    const p = await party(2);
    const date = mtl(1);
    await ok(plan("configure", p.code, p.tokens[0]!, config()));
    for (const tk of p.tokens) await ok(plan("save", p.code, tk, prefs([date])));
    const rs = await Promise.all([plan("begin_lock", p.code, p.tokens[0]!), plan("begin_lock", p.code, p.tokens[0]!, {}, "authenticated")]);
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(rs.filter((r) => r.data.acquired).length).toBe(1);
    expect(rs.find((r) => !r.data.acquired)!.data.lease).toBeNull();
  });

  t("snapshot/complete are service-only; snapshot V3 shape", async () => {
    const p = await v3Locked(2);
    for (const role of ["anon", "authenticated"] as Role[]) {
      await fails(rpc("party_plan_snapshot", { p_code: p.code, p_lease: p.lease }, role));
      await fails(rpc("party_plan_complete", { p_code: p.code, p_lease: p.lease, p_options: [], p_source: "curated" }, role));
      await fails(rpc("party_plan_cleanup", {}, role));
      await fails(rpc("party_v3_prefs", { p: {}, c: {}, p_strict: true }, role));
    }
    const snap = await ok(rpc("party_plan_snapshot", { p_code: p.code, p_lease: p.lease }, "service"));
    expect(Object.keys(snap).sort()).toEqual(["config", "members", "revision", "schemaVersion"]);
    expect(snap.schemaVersion).toBe(3);
    expect(snap.revision).toBe(p.lock.revision);
    expect(snap.members.map((m: any) => m.id).sort()).toEqual([...p.ids].sort());
    await fails(rpc("party_plan_snapshot", { p_code: p.code, p_lease: crypto.randomUUID() }, "service"), "no longer valid");
  });

  t("complete: allowlist projection, constant compromise, typed rejection, outliers ignored", async () => {
    const p = await v3Locked(2);
    const invalid = [option(p.date, { date: mtl(5) }), option(p.date, {}, { source: "google_places" }), option(p.date, { durationMinutes: 90 }), option(p.date, { warnings: ["invented"] }), option(p.date, {}, { mapsUrl: "http://x" }), option(p.date, {}, { cost: { currency: "CAD", minCad: 0, maxCad: 10, free: true, confidence: "verified", checkedAt: "2026-11-01T00:00:00Z", sourceUrl: "https://x.ca" } }), option(p.date, { weather: { temperature: "cold", precipitation: 0, code: 1 } })];
    for (const o of invalid) await fails(rpc("party_plan_complete", { p_code: p.code, p_lease: p.lease, p_options: [o], p_source: "curated" }, "service"), "Invalid planning result.");
    await fails(rpc("party_plan_complete", { p_code: p.code, p_lease: p.lease, p_options: [option(p.date)], p_source: "google_places" }, "service"));
    expect((await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: crypto.randomUUID(), p_options: [option(p.date)], p_source: "curated" }, "service")))).toBe(false);
    const opts = [option(p.date), option(p.date, { startAt: at(p.date, 16), endAt: at(p.date, 17) }), option(p.date, { startAt: at(p.date, 18), endAt: at(p.date, 19) })];
    expect(await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: p.lease, p_options: opts, p_outliers: [p.ids[1]], p_source: "curated" }, "service"))).toBe(true);
    expect(await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: p.lease, p_options: [], p_source: "curated" }, "service"))).toBe(false);
    const r = await plan("read", p.code, p.tokens[1]!);
    expect(r.data.status).toBe("locked");
    expect(r.data.venueSource).toBe("curated");
    expect(r.data.optionCount).toBe(3);
    expect(r.data.plan.compromise).toBe("Review this option");
    expect(Object.keys(r.data.plan).sort()).toEqual(["compromise", "date", "durationMinutes", "endAt", "hoursUnknown", "routeVerifiability", "startAt", "timeZone", "venue", "version", "warnings", "weather"]);
    for (const s of ["score", "secretOrigin", "outlier", "exceeded", p.ids[1]!.slice(0, 8) + "\"]"]) expect(r.text.includes(s)).toBe(false);
  });

  t("vote / host_reroll / finalize revision guards and idempotent final retry", async () => {
    const p = await v3Locked(2);
    const opts = [0, 2, 4, 6].map((h) => option(p.date, { startAt: at(p.date, 10 + h), endAt: at(p.date, 11 + h) }));
    await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: p.lease, p_options: opts, p_source: "curated" }, "service"));
    let s = await ok(plan("read", p.code, p.tokens[1]!));
    await fails(plan("vote", p.code, p.tokens[1]!, { revision: s.revision - 1 }), "This plan changed");
    s = await ok(plan("vote", p.code, p.tokens[1]!, { revision: s.revision }));
    expect(s.planIndex).toBe(1);
    expect(s.groupRerollsUsed).toBe(1);
    await fails(plan("host_reroll", p.code, p.tokens[1]!, { revision: s.revision }), "Only the host");
    s = await ok(plan("host_reroll", p.code, p.tokens[0]!, { revision: s.revision }));
    expect(s.planIndex).toBe(2);
    await fails(plan("finalize", p.code, p.tokens[1]!, { revision: s.revision }), "Only the host");
    await fails(plan("finalize", p.code, p.tokens[0]!, { revision: s.revision - 1 }), "This plan changed");
    await fails(plan("finalize", p.code, p.tokens[0]!, {}), "This plan changed");
    const fin = await ok(plan("finalize", p.code, p.tokens[0]!, { revision: s.revision }));
    expect(fin.status).toBe("final");
    const again = await ok(plan("finalize", p.code, p.tokens[0]!, { revision: s.revision }));
    expect(again.status).toBe("final");
    expect(again.revision).toBe(fin.revision);
    await fails(plan("finalize", p.code, p.tokens[0]!, { revision: s.revision + 1 }));
    await fails(plan("save", p.code, p.tokens[1]!, prefs([p.date])), "frozen");
  });

  t("no_plan is neutral; reopen invalidates options/votes and keeps valid answers", async () => {
    const p = await v3Locked(2);
    expect(await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: p.lease, p_options: [], p_outliers: [p.ids[1]], p_source: "curated" }, "service"))).toBe(true);
    for (const tk of p.tokens) {
      const r = await plan("read", p.code, tk);
      expect(r.data.status).toBe("no_plan");
      expect(r.data.noPlanReason).toBe("no_match");
      expect(r.data.plan).toBeNull();
      expect(r.text.includes("outlier")).toBe(false);
      expect(r.text.includes(p.ids[1]!) && tk === p.tokens[0] ? r.data.members.some((m: any) => m.id === p.ids[1]) : true).toBe(true);
    }
    await fails(plan("reopen", p.code, p.tokens[1]!), "Only the host");
    const re = await ok(plan("reopen", p.code, p.tokens[0]!));
    expect(re.status).toBe("collecting");
    expect(re.optionCount).toBe(0);
    expect(re.members.every((m: any) => m.submitted)).toBe(true);
    expect(re.selfPreferences).not.toBeNull();
  });

  t("reconfigure with new dates invalidates submissions; removal revokes and cancels lease", async () => {
    const p = await party(3);
    const date = mtl(1);
    await ok(plan("configure", p.code, p.tokens[0]!, config()));
    for (const tk of p.tokens) await ok(plan("save", p.code, tk, prefs([date])));
    const re = await ok(plan("configure", p.code, p.tokens[0]!, config({ dateSelection: { mode: "future_dates", selectionStyle: "single", candidateDates: [mtl(2)], range: null } })));
    expect(re.members.every((m: any) => !m.submitted)).toBe(true);
    expect(re.selfPreferences).toBeNull();
    for (const tk of p.tokens) await ok(plan("save", p.code, tk, prefs([mtl(2)])));
    const lock = await ok(plan("begin_lock", p.code, p.tokens[0]!));
    await ok(rpc("party_access", { p_action: "remove", p_code: p.code, p_token: p.tokens[0], p_member: p.ids[2] }));
    await fails(plan("read", p.code, p.tokens[2]!), "removed");
    await fails(plan("save", p.code, p.tokens[2]!, prefs([mtl(2)])), "removed");
    await fails(rpc("party_plan_snapshot", { p_code: p.code, p_lease: lock.lease }, "service"), "no longer valid");
    expect(await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: lock.lease, p_options: [option(mtl(2))], p_source: "curated" }, "service"))).toBe(false);
    const s = await ok(plan("read", p.code, p.tokens[0]!));
    expect(s.status).toBe("collecting");
    expect(s.members.length).toBe(2);
  });

  t("lease expiry: stale service completion cannot publish or reset later job", async () => {
    const p = await v3Locked(2);
    await new Promise((r) => setTimeout(r, 31_000));
    await fails(rpc("party_plan_snapshot", { p_code: p.code, p_lease: p.lease }, "service"), "no longer valid");
    const relock = await ok(plan("begin_lock", p.code, p.tokens[0]!));
    expect(relock.acquired).toBe(true);
    expect(await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: p.lease, p_options: [option(p.date)], p_source: "curated", p_failed: true }, "service"))).toBe(false);
    expect((await ok(plan("read", p.code, p.tokens[0]!))).status).toBe("locking");
    expect(await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: relock.lease, p_options: [option(p.date)], p_source: "curated" }, "service"))).toBe(true);
  }, 60_000);

  t("no direct table access or Realtime exposure for clients", async () => {
    for (const role of ["anon", "authenticated"] as Role[])
      for (const table of ["party_preferences_v3", "party_preferences", "party_planning", "party_members", "party_reroll_votes"]) {
        const r = await fetch(`${URL_}/rest/v1/${table}?select=*&limit=1`, { headers: headers(role) });
        expect(r.ok).toBe(false);
      }
  });
});
