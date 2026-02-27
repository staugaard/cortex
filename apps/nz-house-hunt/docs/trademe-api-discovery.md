# TradeMe REST API Discovery

How we discovered the TradeMe property rental API and what we learned. This is a reference for future work on `trademe-tools.ts`.

## Background

TradeMe's property site (`www.trademe.co.nz/a/property/...`) is an Angular SPA. Fetching any property URL with `fetch()` returns an app shell containing only `<tm-root>` and JS bundles — zero listing data. The GraphQL endpoint (`api.trademe.co.nz/graphql/`) supports marketplace but returns `NOT_FOUND` for property queries.

We used `playwright-cli` to open a real browser, navigate to TradeMe property search pages, and intercept the network requests the frontend actually makes.

## Discovery Technique

The repo's `.playwright/cli.config.json` is configured for Electrobun CDP testing (port 9222). To launch a standalone browser instead, use a separate empty config:

```bash
# Create a throwaway empty config
echo '{}' > .context/playwright-cli.config.json

# Launch a standalone browser
playwright-cli --config=.context/playwright-cli.config.json open

# Intercept network traffic
playwright-cli --config=.context/playwright-cli.config.json run-code "
  const responses = [];
  page.on('response', r => {
    if (r.url().includes('api.trademe')) {
      responses.push({ url: r.url(), status: r.status() });
    }
  });

  await page.goto('https://www.trademe.co.nz/a/property/residential/rent/auckland/north-shore-city/takapuna');
  await page.waitForTimeout(5000);

  console.log(JSON.stringify(responses, null, 2));
"

# Clean up
playwright-cli --config=.context/playwright-cli.config.json close
rm .context/playwright-cli.config.json
```

This revealed the frontend calls a REST API, not GraphQL, for property searches.

## API Endpoints

### Search

```
GET https://api.trademe.co.nz/v1/search/property/rental.json
```

Query parameters:
- `page` — page number (1-indexed)
- `rows` — results per page (default 22)
- `price_min` / `price_max` — weekly rent in NZD
- `bedrooms_min` — minimum bedrooms
- `property_type` — comma-separated property types (see below)
- `canonical_path` — location filter (see below)

Response shape:
```json
{
  "TotalCount": 28,
  "Page": 1,
  "PageSize": 22,
  "List": [
    {
      "ListingId": 1234567,
      "Title": "...",
      "Address": "...",
      "Suburb": "Takapuna",
      "Region": "Auckland",
      "District": "North Shore City",
      "PriceDisplay": "$650 per week",
      "RentPerWeek": 650.0,
      "Bedrooms": 2,
      "Bathrooms": 1,
      "PropertyType": "Apartment",
      "Parking": "...",
      "TotalParking": 1,
      "PetsOkay": 0,
      "AvailableFrom": "/Date(1234567890000)/"
    }
  ]
}
```

### Listing Detail

```
GET https://api.trademe.co.nz/v1/Listings/{listingId}.json
```

Returns a single listing with the same field set plus additional detail fields.

## Required Headers

Discovered by comparing successful browser requests against failed `fetch()` calls:

| Header | Value | Notes |
|--------|-------|-------|
| `Accept` | `application/json` | |
| `Referer` | `https://www.trademe.co.nz/` | **Required.** Using `Origin` instead causes auth errors. |
| `User-Agent` | Standard Chrome UA string | |
| `x-trademe-uniqueclientid` | Random UUID | Generated once per session via `crypto.randomUUID()` |

No API key or OAuth token is needed for property search.

## Property Type Filtering (`property_type`)

The `property_type` query parameter filters results by property type. Multiple types are comma-separated.

Available values: `apartment`, `car-park`, `house`, `townhouse`, `unit`

Examples:
```
property_type=house
property_type=house,townhouse
```

Discovered by clicking the "Property type" filter dropdown on the TradeMe search page and observing the checkboxes (All, Apartment, Car park, House, Townhouse, Unit) and corresponding API parameters in network requests.

## Location Filtering (`canonical_path`)

Location is filtered via the `canonical_path` query parameter. The hierarchy is region > district > suburb.

Format: `/property/residential/rent/{region}/{district}/{suburb}`

Names are lowercased with spaces replaced by hyphens.

Examples:
```
/property/residential/rent/auckland
/property/residential/rent/auckland/north-shore-city
/property/residential/rent/auckland/north-shore-city/takapuna
```

This was discovered by navigating to different suburb-level URLs in the browser and observing the `canonical_path` value in the intercepted API requests.

### Auckland Districts and Suburbs (Partial)

Districts: Auckland City, North Shore City, Manukau City, Waitakere City, Papakura, Rodney, Franklin.

Example suburbs by district:
- **Auckland City**: Ponsonby, Grey Lynn, Kingsland, Mt Eden, Parnell, Remuera, Epsom, Newmarket
- **North Shore City**: Takapuna, Devonport, Milford, Albany, Birkenhead, Browns Bay, Northcote, Belmont

## Gotchas

- **SPA caching**: Navigating to a new TradeMe URL in the same Playwright browser session may not trigger new API calls due to Angular's client-side routing cache. Close and reopen the browser for fresh network intercepts.
- **`Origin` vs `Referer`**: The API rejects requests with an `Origin` header but accepts `Referer: https://www.trademe.co.nz/`. This was only discovered after location-filtered queries started failing with auth errors.
- **Pagination**: Results are 22 per page. When `TotalCount > rows * page`, fetch subsequent pages.
