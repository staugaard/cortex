import { tool } from "ai";
import { z } from "zod";

const MAX_HTML_LENGTH = 80_000;

function truncateHtml(html: string): string {
	if (html.length <= MAX_HTML_LENGTH) return html;
	return html.slice(0, MAX_HTML_LENGTH) + "\n<!-- truncated -->";
}

export const trademeTools = {
	searchTradeMeRentals: tool({
		description:
			"Search TradeMe for rental property listings in Auckland. Returns HTML of the search results page. Use the page parameter to paginate through results.",
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
		}),
		execute: async ({ page, priceMin, priceMax, bedrooms }) => {
			const params = new URLSearchParams();
			if (priceMin) params.set("price_min", String(priceMin));
			if (priceMax) params.set("price_max", String(priceMax));
			if (bedrooms) params.set("bedrooms_min", String(bedrooms));
			params.set("page", String(page));
			const url = `https://www.trademe.co.nz/a/property/residential/rent/auckland?${params}`;

			const response = await fetch(url, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
				},
			});
			if (!response.ok) {
				throw new Error(
					`TradeMe search failed: ${response.status} ${response.statusText}`,
				);
			}
			const html = await response.text();
			return { url, html: truncateHtml(html), page };
		},
	}),

	getTradeMeListingDetail: tool({
		description:
			"Fetch the full detail page for a specific TradeMe listing. Use this to get more info about a listing found in search results.",
		inputSchema: z.object({
			listingUrl: z
				.string()
				.url()
				.describe("Full URL of the TradeMe listing"),
		}),
		execute: async ({ listingUrl }) => {
			const response = await fetch(listingUrl, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
				},
			});
			if (!response.ok) {
				throw new Error(
					`TradeMe detail fetch failed: ${response.status}`,
				);
			}
			const html = await response.text();
			return { url: listingUrl, html: truncateHtml(html) };
		},
	}),
};
