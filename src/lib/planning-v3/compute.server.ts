import "@tanstack/react-start/server-only";
import { curatedVenuesV3 } from "./catalogue";
import { googleRoutes, PlanningProviderError } from "./routes.server";
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
  const key = process.env["GOOGLE_MAPS_API_KEY"];
  const gatewayToken = process.env["LOVABLE_API_KEY"];
  if (!key || !gatewayToken)
    throw new PlanningProviderError("Connect Google Maps Platform before finding an event.");
  const routes = googleRoutes({ key, gatewayToken });
  const options = await solveV3({ ...snapshot, config, members }, venues, routes, forecasts, now);
  // A provider outage is not a private-preference mismatch. Preserve answers for retry.
  if (!options.length && routes.failure) throw new PlanningProviderError(routes.failure);
  return options;
}
