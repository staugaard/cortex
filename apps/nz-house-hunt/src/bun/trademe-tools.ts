import { tool } from "ai";
import { z } from "zod";
import type { RentalListing } from "./listing-schema";

const TRADEME_API_BASE = "https://api.trademe.co.nz/v1";

const TRADEME_HEADERS: Record<string, string> = {
	Accept: "application/json",
	Referer: "https://www.trademe.co.nz/",
	"User-Agent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
	"x-trademe-uniqueclientid": crypto.randomUUID(),
};

/** Convert a thumbnail URL to a full-size image URL. */
function toFullSizeUrl(thumbUrl: string): string {
	return thumbUrl.replace("/photoserver/thumb/", "/photoserver/full/");
}

/**
 * Trim the API response to only the fields the LLM needs for extraction.
 * Only the first photo URL is included to keep the extraction payload small.
 * The full image set is populated by the hydrate step from the detail endpoint.
 */
function simplifyListing(raw: Record<string, unknown>) {
	const firstPhoto = Array.isArray(raw.PhotoUrls) && raw.PhotoUrls.length > 0
		? toFullSizeUrl(raw.PhotoUrls[0] as string)
		: null;

	const geo = raw.GeographicLocation as
		| { Latitude?: number; Longitude?: number }
		| undefined;

	return {
		ListingId: raw.ListingId,
		Title: raw.Title,
		Address: raw.Address,
		Suburb: raw.Suburb,
		Region: raw.Region,
		District: raw.District,
		PriceDisplay: raw.PriceDisplay,
		RentPerWeek: raw.RentPerWeek,
		Bedrooms: raw.Bedrooms,
		Bathrooms: raw.Bathrooms,
		Lounges: raw.Lounges ?? null,
		PropertyType: raw.PropertyType,
		Parking: raw.Parking,
		TotalParking: raw.TotalParking,
		MaxTenants: raw.MaxTenants ?? null,
		PetsOkay: raw.PetsOkay,
		AvailableFrom: raw.AvailableFrom,
		Latitude: geo?.Latitude ?? null,
		Longitude: geo?.Longitude ?? null,
		PhotoUrl: firstPhoto,
		ListingUrl: `https://www.trademe.co.nz/a/property/residential/rent/listing/${raw.ListingId}`,
	};
}

/**
 * Build a canonical_path for location filtering.
 * Format: /property/residential/rent/{region}/{district}/{suburb}
 * Names are lowercased with spaces replaced by hyphens.
 */
function buildCanonicalPath(
	region?: string,
	district?: string,
	suburb?: string,
): string {
	const parts = ["/property/residential/rent"];
	if (region) parts.push(region.toLowerCase().replace(/\s+/g, "-"));
	if (district) parts.push(district.toLowerCase().replace(/\s+/g, "-"));
	if (suburb) parts.push(suburb.toLowerCase().replace(/\s+/g, "-"));
	return parts.join("/");
}

export const trademeTools = {
	searchTradeMeRentals: tool({
		description: [
			"Search TradeMe for rental property listings. Returns structured JSON listing data.",
			"Use the page parameter to paginate through results (22 results per page).",
			"Location hierarchy: region > district > suburb.",
			"Auckland districts include: Auckland City, North Shore City, Manukau City, Waitakere City, Papakura, Rodney, Franklin.",
			"Example suburbs in Auckland City: Ponsonby, Grey Lynn, Kingsland, Mt Eden, Parnell, Remuera, Epsom, Newmarket.",
			"Example suburbs in North Shore City: Takapuna, Devonport, Milford, Albany, Birkenhead.",
			"Use propertyType to filter by property type. Multiple types can be provided as an array.",
		].join(" "),
		inputSchema: z.object({
			page: z
				.number()
				.default(1)
				.describe("Page number, starting from 1"),
			priceMin: z
				.number()
				.optional()
				.describe("Minimum weekly rent in NZD"),
			priceMax: z
				.number()
				.optional()
				.describe("Maximum weekly rent in NZD"),
			bedrooms: z
				.number()
				.optional()
				.describe("Minimum number of bedrooms"),
			region: z
				.string()
				.optional()
				.describe(
					'Region name, e.g. "Auckland", "Wellington", "Canterbury"',
				),
			district: z
				.string()
				.optional()
				.describe(
					'District name within the region, e.g. "Auckland City", "North Shore City"',
				),
			suburb: z
				.string()
				.optional()
				.describe(
					'Suburb name within the district, e.g. "Ponsonby", "Grey Lynn", "Takapuna"',
				),
			propertyType: z
				.array(z.enum(["apartment", "car-park", "house", "townhouse", "unit"]))
				.optional()
				.describe(
					'Filter by property type. e.g. ["house", "townhouse"]',
				),
		}),
		execute: async ({
			page,
			priceMin,
			priceMax,
			bedrooms,
			region,
			district,
			suburb,
			propertyType,
		}) => {
			const params = new URLSearchParams();
			if (propertyType && propertyType.length > 0) {
				params.set("property_type", propertyType.join(","));
			}
			if (priceMin) params.set("price_min", String(priceMin));
			if (priceMax) params.set("price_max", String(priceMax));
			if (bedrooms) params.set("bedrooms_min", String(bedrooms));
			params.set("page", String(page));
			params.set("rows", "22");

			if (region || district || suburb) {
				params.set(
					"canonical_path",
					buildCanonicalPath(region, district, suburb),
				);
			}

			const url = `${TRADEME_API_BASE}/search/property/rental.json?${params}`;

			console.log(
				`[trademe] search: page=${page} price=${priceMin ?? "-"}-${priceMax ?? "-"} beds=${bedrooms ?? "-"} type=${propertyType?.join(",") ?? "all"} location=${region ?? ""}/${district ?? ""}/${suburb ?? ""}`,
			);
			console.log(`[trademe] GET ${url}`);

			const response = await fetch(url, { headers: TRADEME_HEADERS });
			console.log(
				`[trademe] search response: ${response.status} ${response.statusText}`,
			);
			if (!response.ok) {
				throw new Error(
					`TradeMe search failed: ${response.status} ${response.statusText}`,
				);
			}

			const data = (await response.json()) as {
				TotalCount?: number;
				Page?: number;
				PageSize?: number;
				List?: Record<string, unknown>[];
			};

			const listings = (data.List ?? []).map(simplifyListing);
			console.log(
				`[trademe] search results: ${listings.length} listings (total=${data.TotalCount}, page=${data.Page})`,
			);

			return {
				totalCount: data.TotalCount,
				page: data.Page,
				pageSize: data.PageSize,
				listings,
			};
		},
	}),

	getTradeMeListingDetail: tool({
		description:
			"Fetch detail for a specific TradeMe listing by its listing ID. Use this to get more info about a listing found in search results.",
		inputSchema: z.object({
			listingId: z
				.number()
				.describe("The TradeMe listing ID (numeric)"),
		}),
		execute: async ({ listingId }) => {
			const url = `${TRADEME_API_BASE}/Listings/${listingId}.json`;
			console.log(`[trademe] GET detail: ${url}`);

			const response = await fetch(url, { headers: TRADEME_HEADERS });
			console.log(
				`[trademe] detail response: ${response.status} ${response.statusText}`,
			);
			if (!response.ok) {
				throw new Error(
					`TradeMe detail fetch failed: ${response.status}`,
				);
			}

			const data = (await response.json()) as Record<string, unknown>;
			console.log(`[trademe] detail: listing ${listingId} fetched`);

			return simplifyListing(data);
		},
	}),
};

/** Parse TradeMe's .NET JSON date format: "/Date(1234567890000)/" → Date, or ISO string → Date. */
function parseTradeMeDate(value: unknown): Date | null {
	if (value == null) return null;
	const str = String(value);
	const dotNetMatch = str.match(/^\/Date\((\d+)\)\/$/);
	if (dotNetMatch) {
		return new Date(Number(dotNetMatch[1]));
	}
	const d = new Date(str);
	return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Deterministic extraction — maps structured TradeMe search results to listing objects.
 * Replaces the LLM extraction phase since the API already returns structured JSON.
 */
export function extractTradeMeListings(
	toolOutputs: Array<{ toolName: string; input: unknown; output: unknown }>,
): Array<Record<string, unknown>> {
	const listings: Array<Record<string, unknown>> = [];
	const seen = new Set<string>();

	for (const { output } of toolOutputs) {
		const data = output as { listings?: Array<Record<string, unknown>> };
		if (!Array.isArray(data?.listings)) continue;

		for (const raw of data.listings) {
			const sourceId = String(raw.ListingId);
			if (seen.has(sourceId)) continue;
			seen.add(sourceId);

			listings.push({
				sourceName: "trademe",
				sourceId,
				sourceUrl: raw.ListingUrl as string,
				title: raw.Title as string,
				description: "",
				images: raw.PhotoUrl ? [raw.PhotoUrl as string] : [],
				weeklyRent: raw.RentPerWeek as number,
				bedrooms: raw.Bedrooms as number,
				bathrooms: raw.Bathrooms as number,
				lounges: (raw.Lounges as number) ?? null,
				suburb: raw.Suburb as string,
				propertyType: raw.PropertyType as string,
				parkingSpaces: (raw.TotalParking as number) ?? null,
				maxTenants: (raw.MaxTenants as number) ?? null,
				petFriendly: raw.PetsOkay != null ? raw.PetsOkay === 1 : null,
				availableFrom: parseTradeMeDate(raw.AvailableFrom),
				latitude: (raw.Latitude as number) ?? null,
				longitude: (raw.Longitude as number) ?? null,
			});
		}
	}

	return listings;
}

/**
 * Hydrate a listing by fetching the detail endpoint for its Body (description).
 * Used as the pipeline hydrate step — only called for new listings.
 */
export async function hydrateTradeMeListing(
	listing: RentalListing,
): Promise<Partial<RentalListing> | null> {
	const url = `${TRADEME_API_BASE}/Listings/${listing.sourceId}.json`;
	console.log(`[trademe] hydrate: ${listing.sourceId}`);

	const response = await fetch(url, { headers: TRADEME_HEADERS });
	if (!response.ok) {
		throw new Error(
			`TradeMe detail fetch failed: ${response.status} ${response.statusText}`,
		);
	}

	const data = (await response.json()) as {
		Body?: string;
		Photos?: Array<{
			Key: number;
			Value: { FullSize?: string };
		}>;
	};

	const patch: Partial<RentalListing> = {};

	const body = data.Body?.trim();
	if (body) {
		patch.description = body;
	}

	if (Array.isArray(data.Photos) && data.Photos.length > 0) {
		patch.images = data.Photos
			.map((p) => p.Value?.FullSize)
			.filter((url): url is string => typeof url === "string" && url.length > 0);
	}

	return Object.keys(patch).length > 0 ? patch : null;
}
