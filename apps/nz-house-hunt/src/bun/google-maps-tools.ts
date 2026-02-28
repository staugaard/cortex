import { tool, zodSchema } from "ai";
import { z } from "zod";

// ─── Geocoding Tool ─────────────────────────────────────────────────────────
// For the interview agent: resolve place names to coordinates.

const geocodeLocation = tool({
	description:
		"Convert a place name or address to geographic coordinates. " +
		"Use this to get precise lat/lng for locations the user mentions.",
	inputSchema: zodSchema(z.object({
		address: z.string().describe("Place name or address (e.g. 'Newmarket, Auckland')"),
	})),
	execute: async ({ address }) => {
		const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
		url.searchParams.set("address", address);
		url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY!);
		const res = await fetch(url).then((r) => r.json());
		if (res.status !== "OK" || !res.results?.length) {
			return { error: `Geocoding failed: ${res.status}` };
		}
		const { lat, lng } = res.results[0].geometry.location;
		return {
			formattedAddress: res.results[0].formatted_address as string,
			latitude: lat as number,
			longitude: lng as number,
		};
	},
});

// ─── Commute Tool ───────────────────────────────────────────────────────────
// For the enrichment agent: compute real travel times via Google Routes API.

const TRAVEL_MODE_MAP: Record<string, string> = {
	driving: "DRIVE",
	transit: "TRANSIT",
	walking: "WALK",
	bicycling: "BICYCLE",
};

const computeCommute = tool({
	description:
		"Compute travel time and distance between two locations. " +
		"Supports driving, transit, walking, and bicycling. " +
		"Optionally specify departure time for traffic/schedule-aware results. " +
		"Call multiple times for different modes or destinations.",
	inputSchema: zodSchema(z.object({
		originLatitude: z.number().describe("Latitude of the starting location (e.g. the listing)"),
		originLongitude: z.number().describe("Longitude of the starting location"),
		destinationLatitude: z.number().describe("Latitude of the destination (e.g. the user's workplace)"),
		destinationLongitude: z.number().describe("Longitude of the destination"),
		travelMode: z.enum(["driving", "transit", "walking", "bicycling"]),
		departureTime: z.string().optional()
			.describe("ISO 8601 departure datetime for traffic/schedule-aware results"),
	})),
	execute: async ({ originLatitude, originLongitude, destinationLatitude, destinationLongitude, travelMode, departureTime }) => {
		const body: Record<string, unknown> = {
			origin: {
				location: { latLng: { latitude: originLatitude, longitude: originLongitude } },
			},
			destination: {
				location: { latLng: { latitude: destinationLatitude, longitude: destinationLongitude } },
			},
			travelMode: TRAVEL_MODE_MAP[travelMode] ?? "DRIVE",
			routingPreference: travelMode === "driving" ? "TRAFFIC_AWARE" : undefined,
		};

		if (departureTime) {
			body.departureTime = new Date(departureTime).toISOString();
		}

		const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY!,
				"X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.legs.duration,routes.legs.distanceMeters",
			},
			body: JSON.stringify(body),
		});

		const data = await res.json();
		if (!res.ok || !data.routes?.length) {
			return { error: `Routes API failed: ${data.error?.message ?? res.statusText}` };
		}

		const route = data.routes[0];
		const durationSeconds = parseInt(route.duration?.replace("s", "") ?? "0", 10);
		const distanceKm = Math.round((route.distanceMeters ?? 0) / 100) / 10;

		return {
			travelMode,
			durationMinutes: Math.round(durationSeconds / 60),
			distanceKm,
			durationText: `${Math.round(durationSeconds / 60)} min`,
			distanceText: `${distanceKm} km`,
		};
	},
});

// ─── Exports ────────────────────────────────────────────────────────────────
// Separated so the app can give geocodeLocation to the interview agent
// and computeCommute to the enrichment agent.

export const geocodeTools = { geocodeLocation };
export const commuteTools = { computeCommute };
