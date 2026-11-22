import type { Venue } from "./types";

function weekly(open: string, close: string): NonNullable<Venue["hours"]> {
  return Object.fromEntries(Array.from({ length: 7 }, (_, day) => [String(day), [{ open, close }]]));
}

type CatalogueEntry = Pick<Venue, "name" | "category" | "location"> & Partial<Pick<Venue, "priceTier" | "hours">>;

function venue(id: string, entry: CatalogueEntry): Venue {
  const mapsQuery = new URLSearchParams({ api: "1", query: `${entry.name}, Montréal, QC` });
  return {
    placeId: `fallback:${id}`,
    priceTier: null,
    hours: null,
    outdoor: entry.category === "park",
    season: null,
    rating: null,
    mapsUrl: `https://www.google.com/maps/search/?${mapsQuery}`,
    ...entry,
  };
}

// Regular local hours only. Variable admission and prices without a verified tier remain unknown.
export const FALLBACK_VENUES: Venue[] = [
  // https://montreal.ca/en/places/parc-la-fontaine
  // https://geonames.nrcan.gc.ca/search-place-names/unique?id=EQKOO
  venue("parc-la-fontaine", { name: "Parc La Fontaine", category: "park", priceTier: 0,
    location: { lat: 45.5266667, lng: -73.5688889 }, hours: weekly("06:00", "24:00") }),
  // https://montreal.ca/en/places/parc-jarry
  // https://toponymie.gouv.qc.ca/ct/ToposWeb/Fiche.aspx?no_seq=76679
  venue("parc-jarry", { name: "Parc Jarry", category: "park", priceTier: 0,
    location: { lat: 45.53667, lng: -73.62778 }, hours: weekly("06:00", "24:00") }),
  // https://montreal.ca/en/places/square-phillips
  // https://toponymie.gouv.qc.ca/ct/ToposWeb/Fiche.aspx?no_seq=214740
  venue("square-phillips", { name: "Square Phillips", category: "park", priceTier: 0,
    location: { lat: 45.50372, lng: -73.56854 } }),
  // https://montreal.ca/en/places/square-saint-louis
  // https://toponymie.gouv.qc.ca/ct/ToposWeb/fiche.aspx?no_seq=215032
  venue("square-saint-louis", { name: "Square Saint-Louis", category: "park", priceTier: 0,
    location: { lat: 45.51694, lng: -73.56994 } }),

  // https://cafeolimpico.com/fr/pages/locations
  // https://mapcarta.com/N3944641580 (OpenStreetMap)
  venue("cafe-olimpico-mile-end", { name: "Café Olimpico (Mile End)", category: "cafe",
    location: { lat: 45.52408, lng: -73.60026 }, hours: weekly("06:00", "23:00") }),
  // https://crewcollectivecafe.com/en/
  // https://mapcarta.com/fr/N4396828390 (OpenStreetMap)
  venue("crew-collective-cafe", { name: "Crew Collective & Café", category: "cafe",
    location: { lat: 45.50226, lng: -73.5591 } }),

  // https://pacmusee.qc.ca/en/plan-your-visit/hours-and-rates/
  // https://mapcarta.com/fr/W87411702 (OpenStreetMap)
  venue("pointe-a-calliere", { name: "Pointe-à-Callière", category: "museum",
    location: { lat: 45.50261, lng: -73.55425 }, hours: {
      0: [{ open: "11:00", close: "17:00" }], 2: [{ open: "10:00", close: "17:00" }],
      3: [{ open: "10:00", close: "17:00" }], 4: [{ open: "10:00", close: "17:00" }],
      5: [{ open: "10:00", close: "17:00" }], 6: [{ open: "11:00", close: "17:00" }],
    } }),
  // https://www.mbam.qc.ca/en/information/plan-your-visit/
  // https://en.wikipedia.org/wiki/Montreal_Museum_of_Fine_Arts
  venue("montreal-museum-of-fine-arts", { name: "Montreal Museum of Fine Arts", category: "museum",
    location: { lat: 45.4987, lng: -73.5801 }, hours: {
      0: [{ open: "10:00", close: "17:00" }], 2: [{ open: "10:00", close: "17:00" }],
      3: [{ open: "10:00", close: "21:00" }], 4: [{ open: "10:00", close: "17:00" }],
      5: [{ open: "10:00", close: "17:00" }], 6: [{ open: "10:00", close: "17:00" }],
    } }),

  // https://labanquise.com/en/
  // https://meet.mtl.org/en/plan/restaurants/la-banquise ($)
  // https://mapcarta.com/fr/N5228808422 (OpenStreetMap)
  venue("la-banquise", { name: "La Banquise", category: "restaurant", priceTier: 1,
    location: { lat: 45.52533, lng: -73.57475 }, hours: weekly("00:00", "24:00") }),
  // https://schwartzsdeli.com/fr/pages/contact
  // https://mapcarta.com/N343490371 (OpenStreetMap)
  venue("schwartzs-deli", { name: "Schwartz’s Deli", category: "restaurant",
    location: { lat: 45.51633, lng: -73.57765 }, hours: {
      ...weekly("10:00", "23:00"), 5: [{ open: "10:00", close: "24:00" }], 6: [{ open: "10:00", close: "24:00" }],
    } }),

  // https://m.espacepourlavie.ca/node/5288?lang=en
  // https://mapcarta.com/33039046 (OpenStreetMap)
  venue("montreal-planetarium", { name: "Planétarium de Montréal", category: "activity",
    location: { lat: 45.56065, lng: -73.55056 } }),
  // https://espacepourlavie.ca/acces/comment-se-rendre-au-biodome
  // https://mapcarta.com/27687658 (OpenStreetMap)
  venue("montreal-biodome", { name: "Biodôme de Montréal", category: "activity",
    location: { lat: 45.55968, lng: -73.54957 } }),
];
