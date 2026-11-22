import { FALLBACK_VENUES } from "../planning/venues";
import { wallTime } from "../planning/tz";
import type { VenueCandidateV3 } from "./venue";

// These records cover a public walk in the park, excluding facility rentals or reserved activities.
// Only dates with dated schedule evidence are included; the weekly V2 data is deliberately unused.
const parkEvidence = [
  {
    id: "fallback:parc-la-fontaine",
    address: "3819 Avenue Calixa-Lavallée, Montréal, QC H2L 3A7",
    site: "https://montreal.ca/en/places/parc-la-fontaine",
    date: "2026-11-22",
  },
  {
    id: "fallback:parc-jarry",
    address: "205 Rue Gary-Carter, Montréal, QC H2R 2V7",
    site: "https://montreal.ca/en/places/parc-jarry",
    date: "2026-11-22",
  },
];
export const curatedVenuesV3: VenueCandidateV3[] = parkEvidence.flatMap((evidence) => {
  const known = FALLBACK_VENUES.find((venue) => venue.placeId === evidence.id);
  if (!known) return [];
  const checkedAt = wallTime(evidence.date, "00:00");
  return [
    {
      placeId: known.placeId,
      name: known.name,
      address: evidence.address,
      location: known.location,
      mapsUrl: known.mapsUrl,
      activities: ["outdoors"],
      vibes: ["adventurous", "chill_cozy"],
      outdoor: true,
      season: null,
      rating: null,
      source: "curated",
      sourceTimestamp: new Date(checkedAt).toISOString(),
      attribution: [{ name: "Ville de Montréal", url: evidence.site }],
      expiresAt: wallTime(evidence.date, "24:00"),
      opening: [{ start: wallTime(evidence.date, "06:00"), end: wallTime(evidence.date, "24:00") }],
      cost: {
        currency: "CAD",
        minCad: 0,
        maxCad: 0,
        free: true,
        confidence: "verified",
        checkedAt: new Date(checkedAt).toISOString(),
        sourceUrl: evidence.site,
      },
      under18Allowed: true,
      alcoholFree: null,
      accessibility: [],
      dietary: [],
      bookingRequired: "no",
      bookingUrl: null,
    },
  ];
});

// Dated City calendar activity, with an actual registration link and an independently listed venue.
const bookClub = "https://montreal.ca/en/events/book-club-119752";
const library = "https://montreal.ca/en/places/bibliotheque-du-boise";
const bookClubSlot = {
  start: wallTime("2026-11-24", "14:00"),
  end: wallTime("2026-11-24", "15:30"),
};
const checkedAt = new Date(wallTime("2026-11-22", "00:00")).toISOString();
curatedVenuesV3.push({
  placeId: "curated:boise-book-club-2026-11-24",
  name: "Book Club at Bibliothèque du Boisé",
  address: "2727 Boulevard Thimens, Montréal, QC H4R 1T4",
  location: { lat: 45.504489, lng: -73.704747 },
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=45.504489%2C-73.704747",
  activities: ["arts_culture"],
  vibes: ["chill_cozy", "social_lively"],
  outdoor: false,
  season: null,
  rating: null,
  source: "curated",
  sourceTimestamp: checkedAt,
  expiresAt: bookClubSlot.start,
  attribution: [
    { name: "Ville de Montréal (activity)", url: bookClub },
    { name: "Ville de Montréal (venue)", url: library },
  ],
  opening: [bookClubSlot],
  requiredSlot: bookClubSlot,
  cost: {
    currency: "CAD",
    minCad: 0,
    maxCad: 0,
    free: true,
    confidence: "verified",
    checkedAt,
    sourceUrl: bookClub,
  },
  under18Allowed: null,
  alcoholFree: null,
  dietary: [],
  accessibility: [
    "wheelchair_accessible_entrance",
    "wheelchair_accessible_restroom",
    "step_free_entrance",
    "accessible_washroom",
  ],
  bookingRequired: "yes",
  bookingUrl: "https://forms.cloud.microsoft/r/swLinWUdFD",
});

const lachineExhibition =
  "https://montreal.ca/evenements/les-filles-de-lair-marie-blanche-rossi-109178";
const lachineVenue = "https://montreal.ca/lieux/lentrepot-maison-de-la-culture-de-lachine";
// The City publishes hours for this exhibition. Limit the evidence to the two pilot weekends.
const exhibitionOpening = (
  [
    ["2026-11-27", "18:00", "21:00"],
    ["2026-11-28", "12:00", "17:00"],
    ["2026-11-29", "12:00", "17:00"],
    ["2026-12-04", "18:00", "21:00"],
    ["2026-12-05", "12:00", "17:00"],
    ["2026-12-06", "12:00", "17:00"],
  ] as const
).map(([date, from, to]) => ({ start: wallTime(date, from), end: wallTime(date, to) }));

curatedVenuesV3.push({
  placeId: "curated:lachine-les-filles-de-lair-2026",
  name: "Les filles de l’air at L’Entrepôt",
  address: "2901 Boulevard Saint-Joseph, Montréal, QC H8S 4B7",
  location: { lat: 45.433338, lng: -73.68961 },
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=45.433338%2C-73.68961",
  activities: ["arts_culture"],
  vibes: ["chill_cozy", "creative"],
  outdoor: false,
  season: null,
  rating: null,
  source: "curated",
  sourceTimestamp: checkedAt,
  expiresAt: wallTime("2026-12-06", "17:00"),
  attribution: [
    { name: "Ville de Montréal (exhibition)", url: lachineExhibition },
    { name: "Ville de Montréal (venue)", url: lachineVenue },
  ],
  opening: exhibitionOpening,
  cost: {
    currency: "CAD",
    minCad: 0,
    maxCad: 0,
    free: true,
    confidence: "verified",
    checkedAt,
    sourceUrl: lachineExhibition,
  },
  under18Allowed: true,
  alcoholFree: null,
  accessibility: ["wheelchair_accessible_parking"],
  dietary: [],
  bookingRequired: "no",
  bookingUrl: null,
});
