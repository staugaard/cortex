import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { tool } from "ai";
import { baseListingSchema } from "../src/types/index.js";
import { runDiscovery } from "../src/bun/discovery-agent.js";

const SKIP = !process.env.ANTHROPIC_API_KEY;

const rentalSchema = baseListingSchema.extend({
	weeklyRent: z.number(),
	bedrooms: z.number(),
	suburb: z.string(),
});

type RentalListing = z.infer<typeof rentalSchema>;

// Canned HTML that looks like rental search results
const MOCK_SEARCH_HTML = `
<html>
<body>
  <div class="search-results">
    <div class="listing" data-id="tm-101">
      <h2><a href="https://trademe.co.nz/listing/101">Sunny 2-bed apartment in Grey Lynn</a></h2>
      <p class="price">$650/week</p>
      <p class="details">2 bedrooms, 1 bathroom</p>
      <p class="location">Grey Lynn, Auckland</p>
      <p class="description">Bright and airy apartment with open plan living. Walking distance to shops and cafes.</p>
      <img src="https://trademe.co.nz/photos/101/1.jpg" />
    </div>
    <div class="listing" data-id="tm-102">
      <h2><a href="https://trademe.co.nz/listing/102">Spacious 3-bed house in Ponsonby</a></h2>
      <p class="price">$850/week</p>
      <p class="details">3 bedrooms, 2 bathrooms</p>
      <p class="location">Ponsonby, Auckland</p>
      <p class="description">Character villa with large garden. Close to Ponsonby Road restaurants.</p>
      <img src="https://trademe.co.nz/photos/102/1.jpg" />
    </div>
    <div class="listing" data-id="tm-103">
      <h2><a href="https://trademe.co.nz/listing/103">Modern 1-bed studio in CBD</a></h2>
      <p class="price">$450/week</p>
      <p class="details">1 bedroom, 1 bathroom</p>
      <p class="location">Auckland CBD</p>
      <p class="description">Brand new studio apartment in the heart of the city. All amenities included.</p>
      <img src="https://trademe.co.nz/photos/103/1.jpg" />
    </div>
  </div>
</body>
</html>
`;

const mockSearchTool = tool({
	description:
		"Search for rental listings. Returns HTML search results page.",
	inputSchema: z.object({
		page: z.number().default(1),
	}),
	execute: async ({ page }) => ({
		url: `https://example.com/search?page=${page}`,
		html: MOCK_SEARCH_HTML,
		page,
	}),
});

describe.skipIf(SKIP)("Discovery Agent (integration)", () => {
	test(
		"extracts listings from mock search results",
		async () => {
			const result = await runDiscovery<RentalListing>({
				sourceTools: { searchListings: mockSearchTool },
				schema: rentalSchema,
				preferenceProfile: null,
				sourceName: "test",
			});

			expect(result.listings.length).toBeGreaterThanOrEqual(2);
			expect(result.toolCallCount).toBeGreaterThanOrEqual(1);
			expect(result.stepsUsed).toBeGreaterThanOrEqual(1);

			for (const listing of result.listings) {
				// System-managed fields should be hydrated
				expect(listing.id).toBeTruthy();
				expect(listing.discoveredAt).toBeInstanceOf(Date);
				expect(listing.aiRating).toBeNull();
				expect(listing.userRating).toBeNull();
				expect(listing.archived).toBe(false);

				// Source fields should be populated
				expect(listing.sourceName).toBe("test");
				expect(listing.sourceUrl).toBeTruthy();
				expect(listing.title).toBeTruthy();

				// Domain fields should be extracted
				expect(typeof listing.weeklyRent).toBe("number");
				expect(typeof listing.bedrooms).toBe("number");
				expect(typeof listing.suburb).toBe("string");
			}
		},
		120_000,
	);

	test(
		"uses preference profile to guide search",
		async () => {
			const result = await runDiscovery<RentalListing>({
				sourceTools: { searchListings: mockSearchTool },
				schema: rentalSchema,
				preferenceProfile:
					"Looking for 2+ bedroom properties under $700/week in Grey Lynn or Ponsonby",
				sourceName: "test",
			});

			// Should still extract listings (mock always returns same HTML)
			expect(result.listings.length).toBeGreaterThanOrEqual(1);
		},
		120_000,
	);

	test(
		"handles empty search results gracefully",
		async () => {
			const emptyTool = tool({
				description: "Search that returns no results",
				inputSchema: z.object({ page: z.number().default(1) }),
				execute: async () => ({
					url: "https://example.com/search",
					html: "<html><body><p>No listings found</p></body></html>",
				}),
			});

			const result = await runDiscovery<RentalListing>({
				sourceTools: { searchListings: emptyTool },
				schema: rentalSchema,
				preferenceProfile: null,
				sourceName: "test",
			});

			expect(result.listings.length).toBe(0);
		},
		120_000,
	);
});
