// Planning V3 RPC acceptance tests. Wire-level (PostgREST) against an ISOLATED loopback backend only.
// Run: PLANNING_V3_DB_TESTS=1 bun test ./db/tests/planning_v3_rpc.test.ts
// Creates synthetic guest parties; prints only aggregate pass/fail. Never targets non-loopback hosts.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const URL_ = process.env["SUPABASE_URL"] ?? "";
const ANON = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const requested = process.env["PLANNING_V3_DB_TESTS"] === "1";
const loopback = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_);
if (requested && (!loopback || !ANON || !SERVICE)) {
  throw new Error(`PLANNING_V3_DB_TESTS=1 but environment is invalid: loopbackUrl=${loopback} publishableKey=${ANON ? "set" : "missing"} serviceKey=${SERVICE ? "set" : "missing"}. Refusing to skip.`);
}
const d = requested ? describe : describe.skip;
// Direct draft PostgreSQL (loopback psql) for metadata checks and test-only clock moves.
function sql(q: string): string {
  const r = Bun.spawnSync(["psql", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", q]);
  if (r.exitCode !== 0) throw new Error(`psql failed: ${r.stderr.toString().slice(0, 160)}`);
  return r.stdout.toString().trim();
}
const S3 = { schemaVersion: 3 };
async function save(code: string, token: string, preferences: unknown, role: Role = "anon") {
  const cur = await rpc("party_plan", { p_action: "read", p_code: code, p_token: token, p_payload: {} }, role);
  return plan("save", code, token, { preferences, expectedRevision: cur.data?.revision ?? -1 }, role);
}

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
  excludedActivities: ["nightlife"],
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
    attribution: [{ name: "Baggel curated", url: null }], cost: { currency: "CAD", minCad: 10, maxCad: 20, free: false, confidence: "verified", checkedAt: "2026-11-01T00:00:00Z", sourceUrl: "https://example.ca/prices" }, bookingRequired: "unknown", bookingUrl: null,
    accessibilityVerified: false, score: 99, secretOrigin: { lat: 1, lng: 2 }, ...v,
  },
  date, startAt: at(date, 14), endAt: at(date, 15), durationMinutes: 60, timeZone: "America/Montreal",
  compromise: "2 members exceeded budget", hoursUnknown: false,
  routeVerifiability: "provider_verified", weather: null, warnings: ["availability_not_reserved"], score: 0.93, outlierIds: ["x"], origin: { lat: 45.5, lng: -73.5 }, ...o,
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
  for (const t of p.tokens) await ok(save(p.code, t, prefs([date])));
  const lock = await ok(plan("begin_lock", p.code, p.tokens[0]!, S3));
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
    const v2explicit = await ok(plan("configure", p.code, p.tokens[0]!, { version: 2, date: mtl(1), durationMin: 90, areaLabel: "Downtown", areaLat: 45.5, areaLng: -73.57, category: "park" }));
    expect(v2explicit.schemaVersion).toBe(2);
    expect(v2explicit.config.durationMin).toBe(90);
    await ok(plan("save", p.code, p.tokens[0]!, { budget: 2, freeFrom: "10:00", freeTo: "20:00", maxTravelMin: 30 }));
    const v2save = await ok(plan("save", p.code, p.tokens[1]!, { version: 2, budget: 3, freeFrom: "11:00", freeTo: "21:00", maxTravelMin: 45 }));
    expect(v2save.schemaVersion).toBe(2);
    expect(v2save.selfPreferences.budget).toBe(3);
    await fails(plan("save", p.code, p.tokens[1]!, { version: 3, budget: 3, freeFrom: "11:00", freeTo: "21:00", maxTravelMin: 45 }));
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
    await fails(save(p.code, p.tokens[1]!, prefs([mtl(1)])));
    await ok(plan("configure", p.code, p.tokens[0]!, config()));
    await fails(plan("save", p.code, p.tokens[1]!, { budget: 2, freeFrom: "10:00", freeTo: "20:00", maxTravelMin: 30 }), "Invalid planning preferences.");
    await fails(plan("configure", p.code, p.tokens[0]!, { date: mtl(1), durationMin: 60, areaLabel: "x", areaLat: 1, areaLng: 1, category: "park" }), "Invalid planning configuration.");
    // stale expectedRevision and wrong versions fail without mutation
    const before = await ok(plan("read", p.code, p.tokens[1]!));
    await fails(plan("save", p.code, p.tokens[1]!, { preferences: prefs([mtl(1)]), expectedRevision: before.revision - 1 }), "This plan changed");
    await fails(plan("save", p.code, p.tokens[1]!, { preferences: prefs([mtl(1)]), expectedRevision: String(before.revision) }), "Invalid planning preferences.");
    await fails(plan("save", p.code, p.tokens[1]!, { preferences: prefs([mtl(1)]), expectedRevision: before.revision, extra: 1 }), "Invalid planning preferences.");
    await fails(plan("configure", p.code, p.tokens[0]!, { ...config(), version: 4 }), "Invalid planning configuration.");
    await fails(plan("begin_lock", p.code, p.tokens[0]!, {}), "Invalid planning request.");
    await fails(plan("begin_lock", p.code, p.tokens[0]!, { schemaVersion: 2 }), "Invalid planning request.");
    const after = await ok(plan("read", p.code, p.tokens[1]!));
    expect(after.revision).toBe(before.revision);
    expect(after.status).toBe("collecting");
    expect(after.selfPreferences).toBeNull();
    // V2 party rejects V3 envelopes before mutation
    const q = await party(2);
    await fails(plan("save", q.code, q.tokens[1]!, { preferences: prefs([mtl(1)]), expectedRevision: 0 }), "Invalid planning request.");
    await fails(plan("begin_lock", q.code, q.tokens[0]!, S3), "Invalid planning request.");
    expect((await ok(plan("read", q.code, q.tokens[0]!))).schemaVersion).toBe(2);
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
      config({ dateSelection: { mode: "best_day", selectionStyle: "range", candidateDates: [], range: { startDate: mtl(1), endDate: mtl(15) } } }),
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
    await ok(save(p.code, p.tokens[1]!, prefs([date], { optionalNote: "SECRET-NOTE-G1", budget: { currency: "CAD", preferredMinCad: 0, preferredMaxCad: 430, hardMaxCad: 435, explicitlyUnlimited: false }, dietaryHardRequirements: ["shellfish_allergy"] })));
    const hostView = await plan("read", p.code, p.tokens[0]!);
    for (const s of ["SECRET-NOTE-G1", "435", "shellfish_allergy", "45.51"]) expect(hostView.text.includes(s)).toBe(false);
    expect(hostView.data.selfPreferences).toBeNull();
    expect(hostView.data.members.map((m: any) => Object.keys(m).sort().join())).toEqual(["id,submitted", "id,submitted", "id,submitted"]);
    expect(hostView.data.members.find((m: any) => m.id === p.ids[1]).submitted).toBe(true);
    const g2 = await plan("read", p.code, p.tokens[2]!, {}, "authenticated");
    expect(g2.text.includes("SECRET-NOTE-G1")).toBe(false);
    await ok(save(p.code, p.tokens[2]!, prefs([date])));
    const g1 = await ok(plan("read", p.code, p.tokens[1]!));
    expect(g1.selfPreferences.optionalNote).toBe("SECRET-NOTE-G1");
    expect(g1.selfPreferences.origin.lat).toBe(45.51);
    await fails(rpc("party_access", { p_action: "read", p_code: p.code, p_token: "0".repeat(64) }));
    await fails(plan("read", p.code, "nothex"));
  });

  t("contract alignment: large hard cap, multi-line note, int32 revision bounds", async () => {
    const p = await party(2);
    const date = mtl(1);
    await ok(plan("configure", p.code, p.tokens[0]!, config()));
    const tk = p.tokens[1]!;
    const big = prefs([date], { budget: { currency: "CAD", preferredMinCad: 0, preferredMaxCad: 20, hardMaxCad: 5_000_000_000, explicitlyUnlimited: false }, optionalNote: "line one\nline two\tok" });
    await ok(save(p.code, tk, big));
    const r = await ok(plan("read", p.code, tk));
    expect(r.selfPreferences.budget.hardMaxCad).toBe(5_000_000_000);
    expect(r.selfPreferences.optionalNote).toBe("line one\nline two\tok");
    await fails(save(p.code, tk, prefs([date], { optionalNote: "bell\u0007" })));
    await fails(save(p.code, tk, prefs([date], { optionalNote: "x".repeat(501) })));
    // revision > 9 digits is well-formed (stale, not malformed); > int32 is malformed
    await fails(plan("save", p.code, tk, { preferences: prefs([date]), expectedRevision: 1_000_000_000 }), "changed");
    await fails(plan("save", p.code, tk, { preferences: prefs([date]), expectedRevision: 2_147_483_648 }), "Invalid planning preferences");
  });

  t("precise origin: manual (labelled) and current_location both get 1h TTL and stay private", async () => {
    const p = await party(3);
    const date = mtl(1);
    await ok(plan("configure", p.code, p.tokens[0]!, config()));
    const cases = [
      [p.tokens[1]!, p.ids[1]!, { source: "manual", label: "Typed address", lat: 45.523456, lng: -73.581234, accuracy: "precise_ephemeral" }],
      [p.tokens[2]!, p.ids[2]!, { source: "current_location", label: null, lat: 45.534567, lng: -73.592345, accuracy: "precise_ephemeral" }],
    ] as const;
    for (const [tk, id, origin] of cases) {
      await ok(save(p.code, tk, prefs([date], { origin })));
      expect(sql(`select (precise_expires_at between now()+interval '59 minutes' and now()+interval '61 minutes')::text||'|'||submitted::text from public.party_preferences_v3 where member_id='${id}'`)).toBe("true|true");
      const self = await ok(plan("read", p.code, tk));
      expect(self.selfPreferences.origin.lat).toBe(origin.lat);
    }
    const host = JSON.stringify(await ok(plan("read", p.code, p.tokens[0]!)));
    for (const [, , origin] of cases) expect(host).not.toContain(String(origin.lat));
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
      P({ origin: { source: "manual", label: null, lat: 45.5, lng: -73.5, accuracy: "precise_ephemeral" } }),
      P({ origin: { source: "group_area", label: null, lat: null, lng: null, accuracy: "approximate" } }),
      P({ availability: days([{ startAt: at(d1, 10.25), endAt: at(d1, 11) }]) }),
      P({ availability: days([{ startAt: at(d1, 11), endAt: at(d1, 10) }]) }),
      P({ availability: days([{ startAt: at(d1, -1), endAt: at(d1, 1) }]) }),
      P({ availability: days([{ startAt: at(d1, 29), endAt: at(d1, 31) }]) }),
      P({ availability: days([{ startAt: at(d1, 9), endAt: at(d1, 10) }, { startAt: at(d1, 9.5), endAt: at(d1, 11) }]) }),
      P({ availability: { mode: "calendar", tonight: null, days: [{ date: d1, confirmed: true, busyIntervals: [{ startAt: at(d1, 0), endAt: at(d1, 30) }] }, { date: d2, confirmed: true, busyIntervals: [{ startAt: at(d2, 0), endAt: at(d2, 30) }] }] } }),
      P({ availability: days([{ startAt: "2026-13-01T00:00:00Z", endAt: at(d1, 2) }]) }),
      P({ availability: { mode: "calendar", tonight: null, days: [{ date: d1, confirmed: true, busyIntervals: [] }] } }),
      P({ availability: { mode: "tonight", tonight: { earliestDepartureAt: null, latestReturnAt: null, anytimeFromNow: true, noReturnDeadline: true }, days: [] } }),
      P({ optionalNote: 5 }), P({ dietaryHardRequirements: ["Not A Tag"] }), { ...P({}), extra: true }, "string-payload",
    ];
    for (const b of bad) await fails(save(p.code, tk, b), "Invalid planning preferences.");
    expect((await ok(plan("read", p.code, tk))).selfPreferences).toBeNull();

    // Unconfirmed day => draft saved, not submitted.
    await ok(save(p.code, tk, P({ availability: days([], false) })));
    let s = await ok(plan("read", p.code, p.tokens[0]!));
    expect(s.members.find((m: any) => m.id === p.ids[1]).submitted).toBe(false);
    // Overlapping + overnight red blocks merge; zero budget; bike; unlimited.
    // fully busy confirmed day + free other day is valid
    await ok(save(p.code, tk, P({ availability: days([{ startAt: at(d1, 0), endAt: at(d1, 30) }]) })));
    expect((await ok(plan("read", p.code, p.tokens[0]!))).members.find((m: any) => m.id === p.ids[1]).submitted).toBe(true);
    const busy = [{ startAt: at(d1, 22), endAt: at(d1, 25) }, { startAt: at(d1, 9), endAt: at(d1, 10) }, { startAt: at(d1, 10), endAt: at(d1, 11) }, { startAt: at(d1, 11), endAt: at(d1, 12) }];
    await ok(save(p.code, tk, P({ availability: days(busy), budget: { currency: "CAD", preferredMinCad: 0, preferredMaxCad: 0, hardMaxCad: 0, explicitlyUnlimited: false }, travel: { mode: "bike", maxOneWayMinutes: 90, returnMode: "transit", alreadyAtSharedMeetingPoint: false } })));
    s = await ok(plan("read", p.code, tk));
    expect(s.selfPreferences.availability.days[0].busyIntervals).toEqual([{ startAt: at(d1, 9), endAt: at(d1, 12) }, { startAt: at(d1, 22), endAt: at(d1, 25) }]);
    expect(s.members.find((m: any) => m.id === p.ids[1]).submitted).toBe(true);
    const rev = s.revision;
    await ok(save(p.code, tk, P({ availability: days(busy), budget: { currency: "CAD", preferredMinCad: 0, preferredMaxCad: 0, hardMaxCad: 0, explicitlyUnlimited: false }, travel: { mode: "bike", maxOneWayMinutes: 90, returnMode: "transit", alreadyAtSharedMeetingPoint: false } })));
    expect((await ok(plan("read", p.code, tk))).revision).toBe(rev);
    await ok(save(p.code, tk, P({ budget: { currency: "CAD", preferredMinCad: 50, preferredMaxCad: 500, hardMaxCad: null, explicitlyUnlimited: true } })));
  });

  t("tonight mode IDC flags and host rules storage", async () => {
    const p = await party(2);
    await ok(plan("configure", p.code, p.tokens[0]!, config({ dateSelection: { mode: "today_tonight", selectionStyle: null, candidateDates: [], range: null }, area: { mode: "host_area", label: "Mile End", point: { lat: 45.52, lng: -73.6 }, isStrict: false } })));
    const tonight = (o: any) => prefs([], { availability: { mode: "tonight", tonight: o, days: [] } });
    await ok(save(p.code, p.tokens[1]!, tonight({ earliestDepartureAt: null, latestReturnAt: null, anytimeFromNow: true, noReturnDeadline: true })));
    const tomorrow6 = at(mtl(0), 30);
    await ok(save(p.code, p.tokens[0]!, tonight({ earliestDepartureAt: null, latestReturnAt: tomorrow6, anytimeFromNow: true, noReturnDeadline: false }), ));
    await fails(save(p.code, p.tokens[0]!, tonight({ earliestDepartureAt: null, latestReturnAt: at(mtl(0), 31), anytimeFromNow: true, noReturnDeadline: false })), "Invalid planning preferences.");
    await fails(save(p.code, p.tokens[0]!, tonight({ earliestDepartureAt: at(mtl(0), 20), latestReturnAt: null, anytimeFromNow: true, noReturnDeadline: true })), "Invalid planning preferences.");
    await fails(save(p.code, p.tokens[0]!, tonight({ earliestDepartureAt: null, latestReturnAt: null, anytimeFromNow: "yes", noReturnDeadline: true })), "Invalid planning preferences.");
    await ok(save(p.code, p.tokens[1]!, tonight({ earliestDepartureAt: null, latestReturnAt: null, anytimeFromNow: true, noReturnDeadline: true, }) && prefs([], { availability: { mode: "tonight", tonight: { earliestDepartureAt: null, latestReturnAt: null, anytimeFromNow: true, noReturnDeadline: true }, days: [] }, origin: { source: "group_area", label: null, lat: null, lng: null, accuracy: "approximate" } })));
    // minute-granular explicit times; departure earlier than now is fine while enough time remains
    const nowMin = Math.floor(Date.now() / 60000) * 60000;
    const dep = new Date(Math.max(mtlMidnight(mtl(0)).getTime(), nowMin - 47 * 60000)).toISOString().replace(".000Z", "Z");
    await ok(save(p.code, p.tokens[0]!, tonight({ earliestDepartureAt: dep, latestReturnAt: at(mtl(0), 29 + 13 / 60), anytimeFromNow: false, noReturnDeadline: false })));
    await fails(save(p.code, p.tokens[0]!, tonight({ earliestDepartureAt: dep.replace(/:00Z$/, ":30Z"), latestReturnAt: null, anytimeFromNow: false, noReturnDeadline: true })), "Invalid planning preferences.");
    // manual origin needs a label; group_area may carry a label with null coordinates
    await fails(save(p.code, p.tokens[0]!, prefs([], { availability: { mode: "tonight", tonight: { earliestDepartureAt: null, latestReturnAt: null, anytimeFromNow: true, noReturnDeadline: true }, days: [] }, origin: { source: "manual", label: null, lat: 45.5, lng: -73.5, accuracy: "approximate" } })), "Invalid planning preferences.");
    await ok(save(p.code, p.tokens[0]!, prefs([], { availability: { mode: "tonight", tonight: { earliestDepartureAt: null, latestReturnAt: null, anytimeFromNow: true, noReturnDeadline: true }, days: [] }, origin: { source: "group_area", label: "Mile End", lat: null, lng: null, accuracy: "approximate" } })));
    const s = await ok(plan("read", p.code, p.tokens[0]!));
    expect(s.members.every((m: any) => m.submitted)).toBe(true);
    expect(s.selfPreferences.origin.label).toBe("Mile End");
  });

  t("begin_lock anchor: overnight window stays open until next-day 06:00 minus minimum duration (wall-clock independent)", async () => {
    const D = "2026-12-01";
    const c = { duration: { minMinutes: 60 }, dateSelection: { candidateDates: [D] } };
    const open = async (iso: string) => ok(rpc("party_v3_anchor_open", { c, p_at: iso }, "service"));
    expect(await open("2026-12-01T05:00:00Z")).toBe(true);   // 00:00 Montreal (EST)
    expect(await open("2026-12-02T04:59:00Z")).toBe(true);   // 23:59, anchor date already passed
    expect(await open("2026-12-02T10:00:00Z")).toBe(true);   // 05:00 next day, exactly 60 min left
    expect(await open("2026-12-02T10:01:00Z")).toBe(false);  // 05:01 next day, not enough time
    expect(await open("2026-12-02T11:00:00Z")).toBe(false);  // 06:00 next day
    for (const role of ["anon", "authenticated"] as Role[]) await fails(rpc("party_v3_anchor_open", { c, p_at: "2026-12-01T05:00:00Z" }, role));
  });

  t("precise origin: stored with ≤1h TTL, never shown to others, purged on completion", async () => {
    const p = await party(2);
    const date = mtl(1);
    await ok(plan("configure", p.code, p.tokens[0]!, config()));
    await ok(save(p.code, p.tokens[0]!, prefs([date])));
    await ok(save(p.code, p.tokens[1]!, prefs([date], { origin: { source: "current_location", label: null, lat: 45.501234, lng: -73.567891, accuracy: "precise_ephemeral" } })));
    expect((await plan("read", p.code, p.tokens[0]!)).text.includes("45.501234")).toBe(false);
    expect((await ok(plan("read", p.code, p.tokens[1]!))).selfPreferences.origin.lat).toBe(45.501234);
    const lock = await ok(plan("begin_lock", p.code, p.tokens[0]!, S3));
    const snap = await ok(rpc("party_plan_snapshot", { p_code: p.code, p_lease: lock.lease }, "service"));
    expect(JSON.stringify(snap).includes("45.501234")).toBe(true);
    await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: lock.lease, p_options: [option(date)], p_source: "curated" }, "service"));
    const g = await ok(plan("read", p.code, p.tokens[1]!));
    expect(g.selfPreferences).toBeNull();
    // frozen participants keep readiness while locked so cleanup cannot revoke votes
    expect(g.members.find((m: any) => m.id === p.ids[1]).submitted).toBe(true);
    expect(sql(`select count(*) from public.party_preferences_v3 where member_id='${p.ids[1]}' and (precise_expires_at is not null or preferences#>>'{origin,lat}' is not null)`)).toBe("0");
    // underlying document must be re-confirmed so no_plan -> reopen cannot freeze nulled coordinates
    expect(sql(`select submitted::text from public.party_preferences_v3 where member_id='${p.ids[1]}'`)).toBe("false");
    expect(sql(`select submitted::text from public.party_preferences_v3 where member_id='${p.ids[0]}'`)).toBe("true");
  });

  t("begin_lock guards: host must submit, ≥2 submissions", async () => {
    const p = await party(3);
    const date = mtl(1);
    await ok(plan("configure", p.code, p.tokens[0]!, config()));
    await ok(save(p.code, p.tokens[1]!, prefs([date])));
    await ok(save(p.code, p.tokens[2]!, prefs([date])));
    await fails(plan("begin_lock", p.code, p.tokens[0]!, S3), "Submit your own preferences");
    await fails(plan("begin_lock", p.code, p.tokens[1]!, S3), "Only the host");
    const q = await party(2);
    await ok(plan("configure", q.code, q.tokens[0]!, config()));
    await ok(save(q.code, q.tokens[0]!, prefs([date])));
    await fails(plan("begin_lock", q.code, q.tokens[0]!, S3), "At least 2 members");
  });

  t("concurrent begin_lock from two sessions yields exactly one lease", async () => {
    const p = await party(2);
    const date = mtl(1);
    await ok(plan("configure", p.code, p.tokens[0]!, config()));
    for (const tk of p.tokens) await ok(save(p.code, tk, prefs([date])));
    const rs = await Promise.all([plan("begin_lock", p.code, p.tokens[0]!, S3), plan("begin_lock", p.code, p.tokens[0]!, S3, "authenticated")]);
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
    const invalid = [option(p.date, { startAt: "not-a-time" }), option(p.date, {}, { attribution: [{ name: "x", url: "http://insecure" }] }),
      option(p.date, {}, { cost: { currency: "CAD", minCad: 10, maxCad: 30, free: false, confidence: "verified", checkedAt: "2026-11-01T00:00:00Z", sourceUrl: "https://example.ca/p" } }),
      option(p.date, {}, { category: "nightlife" }),
      option(p.date, { startAt: at(p.date, 14.25), endAt: at(p.date, 15.25) }), option(p.date, { startAt: at(p.date, 29.5), endAt: at(p.date, 30.5) }),
      option(p.date, { startAt: at(p.date, 25), endAt: at(p.date, 26) }), option(p.date, {}, { cost: null }), option(p.date, {}, { bookingRequired: "no", bookingUrl: "https://example.ca/book" }),
      option(p.date, { date: mtl(5) }), option(p.date, {}, { source: "google_places" }), option(p.date, { durationMinutes: 90 }), option(p.date, { warnings: ["invented"] }), option(p.date, {}, { mapsUrl: "http://x" }), option(p.date, {}, { cost: { currency: "CAD", minCad: 0, maxCad: 10, free: true, confidence: "verified", checkedAt: "2026-11-01T00:00:00Z", sourceUrl: "https://x.ca" } }), option(p.date, { weather: { temperature: "cold", precipitation: 0, code: 1 } })];
    for (const o of invalid) await fails(rpc("party_plan_complete", { p_code: p.code, p_lease: p.lease, p_options: [o], p_source: "curated" }, "service"), "Invalid planning result.");
    await fails(rpc("party_plan_complete", { p_code: p.code, p_lease: p.lease, p_options: [option(p.date)], p_source: "google_places" }, "service"));
    expect((await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: crypto.randomUUID(), p_options: [option(p.date)], p_source: "curated" }, "service")))).toBe(false);
    // overnight: starts 01:00 on the following Montreal day; date is the actual start day
    const opts = [option(p.date), option(mtl(2), { startAt: at(p.date, 25), endAt: at(p.date, 26) }), option(p.date, { startAt: at(p.date, 18), endAt: at(p.date, 19) })];
    expect(await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: p.lease, p_options: opts, p_outliers: [p.ids[1]], p_source: "curated" }, "service"))).toBe(true);
    expect(await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: p.lease, p_options: [], p_source: "curated" }, "service"))).toBe(false);
    const r = await plan("read", p.code, p.tokens[1]!);
    expect(r.data.status).toBe("locked");
    expect(r.data.venueSource).toBe("curated");
    expect(r.data.optionCount).toBe(3);
    expect(r.data.plan.compromise).toBe("Review this option");
    expect(Object.keys(r.data.plan).sort()).toEqual(["compromise", "date", "durationMinutes", "endAt", "hoursUnknown", "routeVerifiability", "startAt", "timeZone", "venue", "version", "warnings", "weather"]);
    for (const s of ["score", "secretOrigin", "outlier", "exceeded", "lease", p.lease, p.ids[1]!.slice(0, 8) + "\"]"]) expect(r.text.includes(s)).toBe(false);
    expect(JSON.stringify(r.data.plan).includes("origin")).toBe(false);
    expect(r.data.plan.venue.cost.confidence).toBe("verified");
    const all = JSON.parse(sql(`select options::text from public.party_planning s join public.parties p on p.id=s.party_id where p.code='${p.code}'`));
    expect(all[1].date).toBe(mtl(2));
    expect(all.every((o: any) => o.score === undefined && o.venue.secretOrigin === undefined)).toBe(true);
  });

  t("vote / host_reroll / finalize revision guards and idempotent final retry", async () => {
    const p = await v3Locked(2);
    const opts = [0, 2, 4, 6].map((h) => option(p.date, { startAt: at(p.date, 10 + h), endAt: at(p.date, 11 + h) }));
    await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: p.lease, p_options: opts, p_source: "curated" }, "service"));
    let s = await ok(plan("read", p.code, p.tokens[1]!));
    await fails(plan("vote", p.code, p.tokens[1]!, { ...S3, revision: s.revision - 1 }), "This plan changed");
    s = await ok(plan("vote", p.code, p.tokens[1]!, { ...S3, revision: s.revision }));
    expect(s.planIndex).toBe(1);
    expect(s.groupRerollsUsed).toBe(1);
    await fails(plan("host_reroll", p.code, p.tokens[1]!, { ...S3, revision: s.revision }), "Only the host");
    s = await ok(plan("host_reroll", p.code, p.tokens[0]!, { ...S3, revision: s.revision }));
    expect(s.planIndex).toBe(2);
    await fails(plan("finalize", p.code, p.tokens[1]!, { ...S3, revision: s.revision }), "Only the host");
    await fails(plan("finalize", p.code, p.tokens[0]!, { ...S3, revision: s.revision - 1 }), "This plan changed");
    await fails(plan("finalize", p.code, p.tokens[0]!, {}), "Invalid planning request.");
    await fails(plan("vote", p.code, p.tokens[1]!, { revision: s.revision }), "Invalid planning request.");
    const fin = await ok(plan("finalize", p.code, p.tokens[0]!, { ...S3, revision: s.revision }));
    expect(fin.status).toBe("final");
    const again = await ok(plan("finalize", p.code, p.tokens[0]!, { ...S3, revision: s.revision }));
    expect(again.status).toBe("final");
    expect(again.revision).toBe(fin.revision);
    await fails(plan("finalize", p.code, p.tokens[0]!, { ...S3, revision: s.revision + 1 }));
    await fails(save(p.code, p.tokens[1]!, prefs([p.date])), "frozen");
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
    await fails(plan("reopen", p.code, p.tokens[1]!, S3), "Only the host");
    const re = await ok(plan("reopen", p.code, p.tokens[0]!, S3));
    expect(re.status).toBe("collecting");
    expect(re.optionCount).toBe(0);
    expect(re.members.every((m: any) => m.submitted)).toBe(true);
    expect(re.selfPreferences).not.toBeNull();
  });

  t("reconfigure with new dates invalidates submissions; removal revokes and cancels lease", async () => {
    const p = await party(3);
    const date = mtl(1);
    await ok(plan("configure", p.code, p.tokens[0]!, config()));
    for (const tk of p.tokens) await ok(save(p.code, tk, prefs([date])));
    const re = await ok(plan("configure", p.code, p.tokens[0]!, config({ dateSelection: { mode: "future_dates", selectionStyle: "single", candidateDates: [mtl(2)], range: null } })));
    expect(re.members.every((m: any) => !m.submitted)).toBe(true);
    expect(re.selfPreferences).toBeNull();
    for (const tk of p.tokens) await ok(save(p.code, tk, prefs([mtl(2)])));
    const lock = await ok(plan("begin_lock", p.code, p.tokens[0]!, S3));
    await ok(rpc("party_access", { p_action: "remove", p_code: p.code, p_token: p.tokens[0], p_member: p.ids[2] }));
    await fails(plan("read", p.code, p.tokens[2]!), "removed");
    await fails(save(p.code, p.tokens[2]!, prefs([mtl(2)])), "removed");
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
    const relock = await ok(plan("begin_lock", p.code, p.tokens[0]!, S3));
    expect(relock.acquired).toBe(true);
    expect(await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: p.lease, p_options: [option(p.date)], p_source: "curated", p_failed: true }, "service"))).toBe(false);
    expect((await ok(plan("read", p.code, p.tokens[0]!))).status).toBe("locking");
    expect(await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: relock.lease, p_options: [option(p.date)], p_source: "curated" }, "service"))).toBe(true);
  }, 60_000);

  t("membership removal while locked keeps frozen votes; service cleanup purges removed member data", async () => {
    const p = await party(3);
    const date = mtl(1);
    await ok(plan("configure", p.code, p.tokens[0]!, config()));
    for (const tk of p.tokens) await ok(save(p.code, tk, prefs([date])));
    // re-lock with three approximate participants, then remove one while locked: votes still work
    const l2 = await ok(plan("begin_lock", p.code, p.tokens[0]!, S3));
    const opts = [10, 12, 14].map((h) => option(date, { startAt: at(date, h), endAt: at(date, h + 1) }));
    expect(await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: l2.lease, p_options: opts, p_source: "curated" }, "service"))).toBe(true);
    await ok(rpc("party_access", { p_action: "remove", p_code: p.code, p_token: p.tokens[0], p_member: p.ids[2] }));
    expect(await ok(rpc("party_plan_cleanup", {}, "service"))).toBeGreaterThanOrEqual(0);
    let s = await ok(plan("read", p.code, p.tokens[1]!));
    expect(s.status).toBe("locked");
    expect(s.members.length).toBe(2);
    expect(s.members.every((m: any) => m.submitted)).toBe(true);
    expect(s.voteThreshold).toBe(1);
    s = await ok(plan("vote", p.code, p.tokens[1]!, { ...S3, revision: s.revision }));
    expect(s.planIndex).toBe(1);
    expect(sql(`select count(*) from public.party_preferences_v3 where member_id='${p.ids[2]}'`)).toBe("0");
  });

  t("precise TTL expiry revokes snapshot/completion and service sweep purges (test-only clock move)", async () => {
    const p = await party(3);
    const date = mtl(1);
    await ok(plan("configure", p.code, p.tokens[0]!, config()));
    await ok(save(p.code, p.tokens[0]!, prefs([date])));
    await ok(save(p.code, p.tokens[1]!, prefs([date])));
    await ok(save(p.code, p.tokens[2]!, prefs([date], { origin: { source: "current_location", label: "Near me", lat: 45.501234, lng: -73.567891, accuracy: "precise_ephemeral" } })));
    const lock = await ok(plan("begin_lock", p.code, p.tokens[0]!, S3));
    // test-only clock move: precise data of a frozen participant expires mid-lease (requires a writer role on the private table)
    if (sql(`select has_table_privilege(current_user,'public.party_preferences_v3','update')`) !== "t") throw new Error("CLOCK_MOVE_UNAVAILABLE: sandbox role cannot update private table; expiry sub-checks not executable");
    sql(`update public.party_preferences_v3 set updated_at=now()-interval '2 hours', precise_expires_at=now()-interval '1 hour' where member_id='${p.ids[2]}'`);
    await fails(rpc("party_plan_snapshot", { p_code: p.code, p_lease: lock.lease }, "service"), "no longer valid");
    expect(await ok(rpc("party_plan_complete", { p_code: p.code, p_lease: lock.lease, p_options: [option(date)], p_source: "curated" }, "service"))).toBe(false);
    const s1 = await ok(plan("read", p.code, p.tokens[0]!));
    expect(s1.status).toBe("collecting");
    expect(s1.members.find((m: any) => m.id === p.ids[2]).submitted).toBe(false);
    expect(sql(`select coalesce(preferences#>>'{origin,lat}','null')||'|'||coalesce(preferences#>>'{origin,label}','null') from public.party_preferences_v3 where member_id='${p.ids[2]}'`)).toBe("null|null");
    // service sweep purges expired precise data in an idle party
    const q = await party(2);
    await ok(plan("configure", q.code, q.tokens[0]!, config()));
    await ok(save(q.code, q.tokens[1]!, prefs([date], { origin: { source: "current_location", label: "Here", lat: 45.509, lng: -73.561, accuracy: "precise_ephemeral" } })));
    sql(`update public.party_preferences_v3 set updated_at=now()-interval '2 hours', precise_expires_at=now()-interval '1 hour' where member_id='${q.ids[1]}'`);
    expect(await ok(rpc("party_plan_cleanup", {}, "service"))).toBeGreaterThanOrEqual(1);
    expect(sql(`select (precise_expires_at is null)::text||'|'||coalesce(preferences#>>'{origin,lat}','null')||'|'||submitted::text from public.party_preferences_v3 where member_id='${q.ids[1]}'`)).toBe("true|null|false");
  });

  t("catalog: no client grants or Realtime publication for private planning data", async () => {
    const priv = ["party_preferences_v3", "party_preferences", "party_planning", "party_reroll_votes"];
    expect(sql(`select count(*) from pg_publication_tables where schemaname='public' and tablename in (${priv.map((x) => `'${x}'`).join(",")})`)).toBe("0");
    for (const role of ["anon", "authenticated"]) {
      for (const tb of ["party_preferences_v3", "party_planning"]) expect(sql(`select has_table_privilege('${role}','public.${tb}','select,insert,update,delete')`)).toBe("f");
      for (const fn of ["party_plan_snapshot(text,uuid)", "party_plan_complete(text,uuid,jsonb,uuid[],text,boolean)", "party_plan_cleanup()", "party_v3_prefs(jsonb,jsonb,boolean)", "party_v3_slot_ok(timestamptz)"])
        expect(sql(`select has_function_privilege('${role}','public.${fn}','execute')`)).toBe("f");
    }
    expect(sql(`select has_function_privilege('service_role','public.party_plan_cleanup()','execute')`)).toBe("t");
  });

  t("scheduled service cleanup is registered and service-only", async () => {
    const st = await ok(rpc("party_plan_cleanup_status", {}, "service"));
    expect(st.scheduled).toBe(true);
    expect(st.schedule).toBe("*/15 * * * *");
    if (st.lastRun) expect(st.lastRun.status).toBe("succeeded");
    for (const role of ["anon", "authenticated"] as Role[]) await fails(rpc("party_plan_cleanup_status", {}, role));
    expect(typeof (await ok(rpc("party_plan_cleanup", {}, "service")))).toBe("number");
  });

  t("no direct table access or Realtime exposure for clients", async () => {
    for (const role of ["anon", "authenticated"] as Role[])
      for (const table of ["party_preferences_v3", "party_preferences", "party_planning", "party_members", "party_reroll_votes"]) {
        const r = await fetch(`${URL_}/rest/v1/${table}?select=*&limit=1`, { headers: headers(role) });
        // Denied outright, or (party_members: pre-existing grant + RLS with no policies) zero rows.
        const body = await r.text();
        expect(!r.ok || body === "[]").toBe(true);
      }
  });
});
