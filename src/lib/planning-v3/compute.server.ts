import "@tanstack/react-start/server-only";
import { curatedVenuesV3 } from "./catalogue";
import { googleRoutes } from "./routes.server";
import { normalizeConfig, normalizePreferences, snapshotV3Schema } from "./schema";
import { solveV3 } from "./solver";
import { fetchV3Weather } from "./weather.server";

export async function computeV3(raw: unknown, revision: number, now: number) {
  const snapshot = snapshotV3Schema.parse(raw);
  if (snapshot.revision !== revision) throw new Error("Planning revision changed.");
  const config = normalizeConfig(snapshot.config, now, true);
  const members = snapshot.members.map((m) => ({
    ...m,
    preferences: normalizePreferences(m.preferences, config, now, true),
  }));
  const venues = curatedVenuesV3.filter(
    (venue) => venue.expiresAt > now && venue.source === "curated",
  );
  const forecasts = await fetchV3Weather(venues, config.dateSelection.candidateDates);
  const key = process.env["GOOGLE_ROUTES_API_KEY"];
  const routes = googleRoutes(key ? { key } : {});
  return solveV3({ ...snapshot, config, members }, venues, routes, forecasts, now);
}
