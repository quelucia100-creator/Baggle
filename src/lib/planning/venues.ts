import type { Venue } from "./types";

// Public-space fallback only. Opening hours are intentionally unknown, never fabricated.
// The venue workstream can replace/expand this catalogue without changing solver or database contracts.
export const FALLBACK_VENUES: Venue[] = [
  { placeId: "fallback:place-des-arts-esplanade", name: "Place des Arts esplanade", category: "park", priceTier: 0,
    location: { lat: 45.5084, lng: -73.5664 }, hours: null, outdoor: true, season: null, rating: null,
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Place+des+Arts+esplanade+Montreal" },
  { placeId: "fallback:square-phillips", name: "Square Phillips", category: "park", priceTier: 0,
    location: { lat: 45.5035, lng: -73.5698 }, hours: null, outdoor: true, season: null, rating: null,
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Square+Phillips+Montreal" },
  { placeId: "fallback:square-saint-louis", name: "Square Saint-Louis", category: "park", priceTier: 0,
    location: { lat: 45.5167, lng: -73.5692 }, hours: null, outdoor: true, season: null, rating: null,
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Square+Saint-Louis+Montreal" },
];