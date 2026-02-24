# Listing Hunter Specification

> See also: [Listing Hunter concept doc](../apps/nz-house-hunt/.context/listing-hunter-concept.md) for the original product vision.

## 1. Problem Statement

### The Challenge

Searching for a house (or a job, or a car) involves monitoring multiple sources daily, mentally filtering out irrelevant listings, remembering what you've already seen, and gradually refining what you actually want. It's tedious, repetitive, and poorly served by existing tools that offer basic saved searches and email alerts.

The core pain points:

- **Repetitive scanning**: Checking the same sites daily, scrolling past listings you've already dismissed.
- **Mental filtering**: Keeping complex, nuanced preferences in your head and applying them to every listing.
- **Preference drift**: What you want evolves as you see more listings, but there's no system that adapts with you.
- **No memory**: You forget what you've seen, re-evaluate the same listings, lose track of promising ones.
- **Crude filters**: Platform search filters capture the obvious stuff (price, bedrooms) but miss the subtle preferences that actually matter (bush feel, quiet street, character).

### Context

This is a personal tool, not a platform. It runs locally on one machine, stores data in SQLite, and uses LLMs for the intelligence layer. The goal is to make listing search feel like having a knowledgeable assistant who knows your taste and gets better over time.

### The Reusable Foundation

The listing-hunt workflow is domain-agnostic. The same find-rate-learn loop applies to house hunting, job hunting, car buying, rental searching — any search-evaluate-decide process. The domain-specific parts are narrow: where to find listings (source connectors) and what extra context to pull in (enrichment). Everything else — the preference interview, the rating feedback loop, the feed UI — is reusable across domains.

## 2. Proposed Solution

### Vision

A shared package (`@cortex/listing-hunter`) that provides the complete find-rate-learn loop as a generic, domain-agnostic library. An app provides two things: a Zod schema describing its listing type (rental, job, car) and source configurations describing where to find listings. The package handles everything else — interviewing the user, running the discovery pipeline, rating listings, learning from feedback, and rendering the UI.

### Two Living Documents

The system's intelligence lives in two plain-text documents stored in the database:

**Preference Profile** — Generated from a conversational interview with the user. Captures explicit wants, needs, dealbreakers, and tradeoffs in natural language. The user can revisit the interview at any time to update it.

**Calibration Log** — Synthesized from the user's rating history. When the user rates a listing differently than the AI predicted, the override and reasoning are captured. Periodically, these overrides are synthesized into a narrative that describes the user's revealed preferences — patterns that emerge from actual behaviour rather than stated intent.

Both documents are included in the AI's system prompt for all operations (rating, chat, enrichment). Together they give the AI both what the user says they want and what they demonstrably want. Both are periodically re-synthesized to stay concise and current.

### Key Features

- **Conversational preference setup** — No forms. The AI interviews the user and produces the preference profile through conversation.
- **AI-driven discovery pipeline** — Sources are configured with URLs and search parameters. The LLM extracts structured listing data, deduplicates, enriches, and rates — all driven by the preference profile and calibration log.
- **Listing feed** — The primary UI. New listings sorted by AI-predicted rating, with inline 1–5 star rating controls and optional notes.
- **Feedback loop** — User ratings that diverge from AI predictions are captured and periodically synthesized into the calibration log, improving future predictions.
- **Chat interface** — Available alongside the feed for refining preferences, asking questions about listings, searching, comparing, and market analysis.
- **Full generics** — Apps define their domain schema once (as a Zod schema) and get type safety everywhere: database access, LLM extraction, UI rendering.

### Package / App Split

```
packages/listing-hunter/          @cortex/listing-hunter
  Everything domain-agnostic:
  - Generic type system (BaseListing + app-provided extensions)
  - SQLite schema + data layer (Drizzle + bun:sqlite)
  - Discovery pipeline orchestration
  - AI-driven extraction, rating, calibration
  - Interview system
  - Feed, rating, and chat UI components
  - Two-document prompt management

apps/nz-house-hunt/               First consumer
  Domain-specific only:
  - Zod schema for NZ rental listings
  - TradeMe source configuration
  - Auckland-specific enrichment prompts
  - Wires up @cortex/listing-hunter with the above
```

### First App: NZ House Hunt

The first implementation targets Auckland rental listings on TradeMe. This validates the full system end-to-end with a real domain before any second app is built.

## 3. Architecture Design

### Key Architectural Decisions

1. **Zod as the single source of truth for domain schemas.** The app provides a Zod schema extending `baseListingSchema`. This one schema drives: TypeScript types (via `z.infer`), LLM structured extraction (via ai-sdk's `generateObject`), database column typing (metadata JSON parsed through Zod), and UI field rendering. No separate type definitions, no schema drift.

2. **Source connectors are ai-sdk tools provided by the app.** The app provides source tools (using ai-sdk's `tool()`) that the discovery agent can call. This is more flexible than declarative config — different sources can have completely different interaction patterns (HTML scraping, API calls, RSS, browser automation). The app controls the fetching mechanics (auth, rate limiting, headers); the AI controls the search strategy (what to search for, when to paginate, when to stop).

3. **Single-process, in-app pipeline.** The discovery pipeline runs inside the Electrobun bun process on a timer. No separate worker, no external scheduler. This keeps the feed live-updating and the architecture simple.

4. **Drizzle ORM with bun:sqlite.** Bun has SQLite built in (fast, zero-dep). Drizzle provides typed schema definitions, type-safe queries, and migrations on top. Domain-specific fields live in a `metadata` JSON column; the app gets typed access through the Zod schema.

5. **ai-sdk for all AI interactions.** One abstraction for the interview, pipeline extraction, rating, calibration synthesis, and chat. Keeps the LLM integration consistent and model-swappable.

6. **Chat infrastructure via `@cortex/chat-core`.** The interview and listing chat use the existing shared chat package for streaming transport, RPC contracts, persistence, and agent utilities. `@cortex/listing-hunter` provides the domain-specific agents (interview prompts, listing-aware tools) but does not reimplement chat plumbing.

7. **Runtime boundary: Bun vs. webview.** Following the monorepo's established pattern (see `@cortex/chat-core`), the package exposes subpath exports that separate Bun-only code from webview-safe code. The pipeline, database, and AI calls run in Bun. The feed UI, rating controls, and chat components run in the webview. Communication crosses via Electrobun RPC.

### Component Breakdown

```
┌─────────────────────────────────────────────────────┐
│  App (nz-house-hunt)                                │
│  - Domain Zod schema                                │
│  - Source tools (TradeMe search, detail fetch)      │
│  - Enrichment prompts                               │
│  - Wires everything together                        │
└──────────────┬──────────────────────────────────────┘
               │ provides config to
               ▼
┌─────────────────────────────────────────────────────┐
│  @cortex/listing-hunter                             │
│                                                     │
│  Bun-side (pipeline, db, ai)                        │
│  ┌───────────────────────────────────────────────┐  │
│  │  ListingHunter<T>        Core orchestrator    │  │
│  │  ├─ Pipeline             Discover/rate loop   │  │
│  │  │  ├─ SourceFetcher     Fetch + LLM extract  │  │
│  │  │  ├─ Deduplicator      Merge duplicates     │  │
│  │  │  ├─ Enricher          Add context via LLM  │  │
│  │  │  └─ Rater             Score vs. profile    │  │
│  │  ├─ DocumentManager      Pref profile + cal   │  │
│  │  ├─ InterviewAgent       Conversational setup  │  │
│  │  ├─ ChatAgent            Feed-aware chat       │  │
│  │  └─ Database             Drizzle + bun:sqlite  │  │
│  │                                                │  │
│  │  Uses @cortex/chat-core for:                   │  │
│  │  ├─ Streaming transport (Bun ↔ webview)        │  │
│  │  ├─ Chat RPC contracts                         │  │
│  │  └─ Agent runner utilities                     │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  Webview-side (React components)                    │
│  ┌───────────────────────────────────────────────┐  │
│  │  <ListingFeed />         Card list + filters  │  │
│  │  <ListingCard />         Single listing + rate │  │
│  │  <RatingControl />       1-5 stars + note     │  │
│  │  <Shortlist />           Top-rated view       │  │
│  │  <InterviewChat />       Preference setup     │  │
│  │  <ListingChat />         Feed-aware assistant  │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  Shared (types, RPC contracts)                      │
│  ┌───────────────────────────────────────────────┐  │
│  │  baseListingSchema       Zod base schema      │  │
│  │  RPC types               Bun ↔ webview calls  │  │
│  │  ListingHunterConfig<T>  App config shape     │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Generic Type System

The app defines its domain by extending the base listing schema:

```ts
// Package provides the base
const baseListingSchema = z.object({
  id: z.string(),
  sourceId: z.string(),       // ID from the source platform
  sourceName: z.string(),     // e.g. "trademe"
  sourceUrl: z.string().url(),
  title: z.string(),
  description: z.string(),
  images: z.array(z.string().url()),
  discoveredAt: z.coerce.date(),
  aiRating: z.number().min(1).max(5).nullable(),
  aiRatingReason: z.string().nullable(),
  userRating: z.number().min(1).max(5).nullable(),
  userRatingNote: z.string().nullable(),
  archived: z.boolean().default(false),
});

// App extends it with domain fields
const rentalListingSchema = baseListingSchema.extend({
  weeklyRent: z.number(),
  bedrooms: z.number(),
  bathrooms: z.number(),
  suburb: z.string(),
  propertyType: z.string(),   // "house", "apartment", "townhouse"
  parkingSpaces: z.number().nullable(),
  petFriendly: z.boolean().nullable(),
  availableFrom: z.coerce.date().nullable(),
});

type RentalListing = z.infer<typeof rentalListingSchema>;
```

The app passes this schema into the package at setup:

```ts
const hunter = createListingHunter({
  schema: rentalListingSchema,
  sources: [trademeSource],
  enrichmentPrompt: "...",
  dbPath: "./data/nz-house-hunt.sqlite",
});
```

The package uses the schema for:
- **LLM extraction**: Passed to `generateObject({ schema })` so the LLM produces typed listings from raw page content.
- **Database typing**: The base fields map to SQLite columns. Extended fields are stored as JSON in a `metadata` column, validated through the Zod schema on read.
- **UI rendering**: The webview receives typed listing objects via RPC. Components can render domain-specific fields because the type flows through.

### Database Schema

All tables managed by the package. The app doesn't define tables.

```sql
-- Core listing storage
-- Base fields are columns; domain-specific fields live in metadata JSON
CREATE TABLE listings (
  id            TEXT PRIMARY KEY,
  source_id     TEXT NOT NULL,          -- ID on the source platform
  source_name   TEXT NOT NULL,          -- e.g. "trademe"
  source_url    TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  images        TEXT NOT NULL,          -- JSON array of URLs
  metadata      TEXT NOT NULL,          -- JSON: domain-specific fields
  ai_rating     INTEGER,               -- 1-5
  ai_rating_reason TEXT,
  user_rating   INTEGER,               -- 1-5
  user_rating_note TEXT,
  archived      INTEGER NOT NULL DEFAULT 0,
  discovered_at TEXT NOT NULL,          -- ISO 8601
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_name, source_id)
);

-- Rating overrides for calibration synthesis
CREATE TABLE rating_overrides (
  id            TEXT PRIMARY KEY,
  listing_id    TEXT NOT NULL REFERENCES listings(id),
  ai_rating     INTEGER NOT NULL,       -- what the AI predicted
  user_rating   INTEGER NOT NULL,       -- what the user gave
  user_note     TEXT,                   -- why they disagree
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The two living documents
CREATE TABLE documents (
  type          TEXT PRIMARY KEY,        -- 'preference_profile' | 'calibration_log'
  content       TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Chat message persistence handled by @cortex/chat-core

-- Source cursor tracking for incremental discovery
CREATE TABLE source_cursors (
  source_name   TEXT PRIMARY KEY,
  cursor_value  TEXT NOT NULL,          -- source-specific (page number, date, token)
  last_run_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Pipeline run history
CREATE TABLE pipeline_runs (
  id            TEXT PRIMARY KEY,
  started_at    TEXT NOT NULL,
  completed_at  TEXT,
  status        TEXT NOT NULL,          -- 'running' | 'completed' | 'failed'
  stats         TEXT NOT NULL,          -- JSON: { discovered, duplicates, new, rated }
  error         TEXT
);
```

### Source Tools

Sources are ai-sdk tools provided by the app. The discovery agent calls them as needed — the AI decides the search strategy, the tools handle the mechanics.

```ts
import { tool } from "ai";

// The app provides tools that the discovery agent can call.
// Each tool handles one interaction with a source.

const trademeTools = {
  searchTradeMeRentals: tool({
    description: "Search TradeMe for rental property listings in Auckland. Returns HTML of the search results page.",
    parameters: z.object({
      page: z.number().default(1),
      priceMin: z.number().optional(),
      priceMax: z.number().optional(),
      bedrooms: z.number().optional(),
    }),
    execute: async ({ page, priceMin, priceMax, bedrooms }) => {
      const params = new URLSearchParams();
      if (priceMin) params.set("price_min", String(priceMin));
      if (priceMax) params.set("price_max", String(priceMax));
      if (bedrooms) params.set("bedrooms_min", String(bedrooms));
      params.set("page", String(page));
      const url = `https://www.trademe.co.nz/a/property/residential/rent/auckland?${params}`;
      const html = await fetch(url).then(r => r.text());
      return { url, html };
    },
  }),

  getTradeMeListingDetail: tool({
    description: "Fetch the full detail page for a specific TradeMe listing. Use this to get more info about a listing found in search results.",
    parameters: z.object({
      listingUrl: z.string().url(),
    }),
    execute: async ({ listingUrl }) => {
      const html = await fetch(listingUrl).then(r => r.text());
      return { url: listingUrl, html };
    },
  }),
};
```

The app registers these when creating the hunter:

```ts
const hunter = createListingHunter({
  schema: rentalListingSchema,
  sourceTools: trademeTools,
  enrichmentPrompt: "...",
  dbPath: "./data/nz-house-hunt.sqlite",
});
```

This model is more flexible than declarative config because:
- The AI decides search parameters based on the preference profile (e.g. narrowing price ranges)
- Different sources can have completely different interaction patterns
- The app controls auth, rate limiting, and request mechanics
- Tools can evolve (e.g. add a detail-page fetcher) without changing the package
- The same pattern works for API-based sources, RSS feeds, or even browser automation

### Pipeline Flow

The pipeline runs on a configurable timer inside the bun process. The discovery step is an AI agent with tools; the remaining steps are deterministic or single-shot LLM calls.

```
┌────────────────┐    ┌────────┐    ┌────────┐    ┌──────┐    ┌───────┐
│ Discover        │───▶│ Filter │───▶│ Enrich │───▶│ Rate │───▶│ Store │
│ (agent + tools) │    │        │    │        │    │      │    │       │
└────────────────┘    └────────┘    └────────┘    └──────┘    └───────┘
  AI agent calls       Drop IDs     LLM adds      Score vs     Insert
  source tools,        already in   context        pref profile  into DB
  extracts listings    the DB       (optional)     + cal log    + notify
  via Zod schema
```

Each step:

1. **Discover** — An AI agent is given the source tools, the domain Zod schema, and the preference profile. It calls source tools to search and fetch listings, then extracts structured data matching the schema. The agent handles pagination, deduplication within the batch, and deciding when it has found enough new listings. This is a multi-turn agent loop, not a single LLM call.
2. **Filter** — Drop listings whose `(source_name, source_id)` already exist in the database. This is a deterministic DB check, not an LLM call.
3. **Enrich** — For each new listing, optionally call the LLM with the listing data + the app's enrichment prompt to add context (e.g. commute estimates, neighbourhood descriptions). Enrichment results are merged into the listing's metadata.
4. **Rate** — For each new listing, call the LLM with the listing data + preference profile + calibration log. Ask for a 1-5 rating and a brief reason.
5. **Store** — Insert into SQLite. Send an RPC message to the webview so the feed updates live.

### RPC Contracts (Bun ↔ Webview)

Listing-specific RPC. Chat/interview streaming uses `@cortex/chat-core`'s existing transport contracts.

```ts
// Bun-side requests (webview calls these)
type BunRequests = {
  getListings: {
    params: { filter: 'new' | 'shortlist' | 'all' | 'archived'; limit?: number; offset?: number };
    response: { listings: Listing[]; total: number };
  };
  getListing: {
    params: { id: string };
    response: Listing;
  };
  rateListing: {
    params: { id: string; rating: number; note?: string };
    response: { listing: Listing };
  };
  archiveListing: {
    params: { id: string };
    response: void;
  };
  getDocuments: {
    params: void;
    response: { preferenceProfile: string | null; calibrationLog: string | null };
  };
  runPipeline: {
    params: void;
    response: { runId: string };
  };
};

// Webview messages (bun sends, fire-and-forget)
type WebviewMessages = {
  listingsUpdated: { newCount: number };
  pipelineStatus: { runId: string; status: string; stats?: object };
  documentsUpdated: { type: 'preference_profile' | 'calibration_log' };
};

// Chat streaming (interview + listing chat) uses @cortex/chat-core:
//   - @cortex/chat-core/transport-bun for Bun-side stream forwarding
//   - @cortex/chat-core/transport-web for webview transport adapter
//   - @cortex/chat-core/rpc for shared message contracts
```

### Package Subpath Exports

Following the `@cortex/chat-core` pattern:

```
@cortex/listing-hunter/types      — Zod schemas, TypeScript types, config interfaces (runtime-agnostic)
@cortex/listing-hunter/bun        — ListingHunter, Pipeline, Database, AI agents (Bun-only)
@cortex/listing-hunter/react      — Feed, Card, Rating, Chat components (webview-only)
@cortex/listing-hunter/rpc        — RPC contract types (runtime-agnostic)
```

## 4. Implementation Phases

Each phase is independently completable and testable. Earlier phases build the foundation that later phases depend on. The first app (nz-house-hunt) is the proving ground throughout.

### Phase 1: Package Skeleton + Database

**Goal**: Establish the package with the generic type system, database schema, and basic CRUD — the data layer everything else builds on.

**Implementation**:
- Create `packages/listing-hunter/` with subpath exports (`types`, `bun`, `react`, `rpc`)
- Define `baseListingSchema` and the `ListingHunterConfig<T>` type
- Set up Drizzle with `bun:sqlite` — schema definitions for all five tables
- Implement database module: migrations, typed CRUD for listings (insert, query, update rating), documents (get/set), pipeline runs, rating overrides
- Wire up `nz-house-hunt` as the first consumer: define `rentalListingSchema`, call `createListingHunter()`, verify the database initializes and migrates
- Add `typecheck` and `test` scripts to the package

**Testing**:
- Unit tests for database CRUD: insert a listing, query it back with metadata parsed through Zod, update ratings, verify override recording
- Typecheck passes for both Bun and webview subpaths
- `nz-house-hunt` app boots and creates the SQLite database file

**Success criteria**:
- [ ] `packages/listing-hunter` exists with working subpath exports
- [ ] `baseListingSchema` + `rentalListingSchema` defined and tested
- [ ] All five database tables created via Drizzle migration
- [ ] Typed CRUD operations working with generic metadata
- [ ] `bun run --cwd packages/listing-hunter test` passes
- [ ] `nz-house-hunt` app initializes the database on startup

### Phase 2: Discovery Pipeline

**Goal**: The AI agent can call source tools, extract listings, filter out duplicates, and store new listings in the database.

**Implementation**:
- Implement the discovery agent: an ai-sdk agent that receives source tools + the domain Zod schema + preference profile, and produces a batch of typed listings
- Implement the filter step: check extracted listings against existing `(source_name, source_id)` pairs in the database
- Implement the store step: insert new listings into the database
- Define `trademeTools` in `nz-house-hunt` (search + detail fetch)
- Wire up a manual pipeline trigger (RPC call from webview, no timer yet)
- Pipeline run tracking: create pipeline_runs record, update status/stats on completion

**Testing**:
- Integration test: mock source tools that return canned HTML, verify the agent extracts listings matching the Zod schema
- End-to-end in `nz-house-hunt`: trigger pipeline manually, verify TradeMe listings appear in the database with correct metadata
- Verify deduplication: run pipeline twice, confirm no duplicate listings

**Success criteria**:
- [ ] Discovery agent calls source tools and extracts typed listings
- [ ] Filter step correctly skips existing listings
- [ ] Pipeline stores new listings with all base + domain fields
- [ ] Pipeline runs are tracked in `pipeline_runs` table
- [ ] Manual trigger works via RPC from the webview

### Phase 3: Rating + Feedback Loop

**Goal**: The AI rates new listings against the preference profile. Users can override ratings. Overrides are recorded for future calibration.

**Implementation**:
- Implement the rating step: for each new listing, call the LLM with listing data + preference profile + calibration log (if it exists). Get back a 1-5 rating and reason.
- Integrate rating into the pipeline: runs after filter, before store. Listings are stored with `ai_rating` and `ai_rating_reason` populated.
- Implement the `rateListing` RPC handler: when the user rates a listing, compare against `ai_rating`. If different, insert a `rating_overrides` row with both ratings and the user's note.
- Implement calibration synthesis: given all rating overrides, ask the LLM to produce/update the calibration log document. Run this after every N overrides (start with N=5) or on demand.
- Integrate calibration log into pipeline: rating step includes it in the system prompt alongside the preference profile.

**Testing**:
- Unit test: given a listing and preference profile, verify the LLM produces a rating in the expected format
- Integration test: rate a listing via RPC, verify override is recorded, trigger calibration synthesis, verify calibration log is updated
- Verify calibration log appears in the rating prompt for subsequent pipeline runs

**Success criteria**:
- [ ] Pipeline produces AI ratings for all new listings
- [ ] User can rate listings via RPC
- [ ] Rating overrides are recorded when user and AI disagree
- [ ] Calibration synthesis produces/updates the calibration log document
- [ ] Subsequent pipeline runs include the calibration log in rating prompts

### Phase 4: Interview System

**Goal**: A conversational AI interview that produces the preference profile. Users can revisit and update it.

**Implementation**:
- Implement the interview agent: an ai-sdk agent with a system prompt that instructs it to interview the user about their listing preferences. Domain context comes from the Zod schema (so it knows what fields exist — bedrooms, suburb, price, etc.).
- The agent has a tool to save/update the preference profile document when it has gathered enough information.
- Use `@cortex/chat-core` for streaming transport (Bun → webview), message persistence, and the agent runner pattern. The interview agent is a domain-specific agent wired through chat-core's infrastructure.
- First-run detection: if no preference profile exists, the app shows the interview UI on startup.

**Testing**:
- Integration test: send a few messages to the interview agent, verify it asks relevant questions and eventually produces a preference profile document
- Verify the preference profile is persisted and available to the pipeline's rating step
- Verify re-opening the interview loads chat history and allows updates

**Success criteria**:
- [ ] Interview agent asks relevant questions based on the domain schema
- [ ] Preference profile document is produced and stored
- [ ] Chat history is persisted and reloaded
- [ ] Preference profile is used by the rating step in the pipeline
- [ ] User can revisit and update the profile through further conversation

### Phase 5: Feed UI

**Goal**: The primary listing feed in the webview — listing cards, rating controls, filtering, and live updates.

**Implementation**:
- Implement `<ListingFeed />`: paginated list of listings with filter tabs (New, Shortlist, All, Archived). Default sort: AI rating descending for new, user rating descending for shortlist.
- Implement `<ListingCard />`: displays title, images (carousel or first image), key domain fields (rendered from metadata), AI rating, source link. Expandable for full description.
- Implement `<RatingControl />`: inline 1-5 star picker with optional note field. Calls `rateListing` RPC on change.
- Implement `<Shortlist />`: filtered view of listings with `user_rating >= 4` (or configurable threshold).
- Live updates: listen for `listingsUpdated` RPC messages and refresh the feed.
- Archive action: swipe or button to archive a listing (removes from default feed view).

**Testing**:
- Seed the database with test listings, verify the feed renders correctly
- Rate a listing in the UI, verify the rating persists and the card updates
- Trigger a pipeline run, verify new listings appear in the feed without a page refresh
- Archive a listing, verify it moves to the archived view

**Success criteria**:
- [ ] Feed renders listings sorted by AI rating
- [ ] Filter tabs work (New, Shortlist, All, Archived)
- [ ] Rating control updates the database and shows the updated rating
- [ ] Live updates work when the pipeline discovers new listings
- [ ] Archive removes listings from the default view

### Phase 6: Chat + Enrichment

**Goal**: A feed-aware chat assistant and optional enrichment step in the pipeline.

**Implementation**:
- Implement the listing chat agent: an ai-sdk agent with access to the listing database (via tools). It can query listings, compare them, answer questions about specific listings, and refine the preference profile. System prompt includes both living documents.
- Chat tools: `searchListings`, `getListingDetail`, `compareListings`, `updatePreferenceProfile`
- Use `@cortex/chat-core` for streaming, persistence, and the webview transport — same as the interview agent. `<ListingChat />` and `<InterviewChat />` are thin wrappers that provide the right agent config to chat-core's infrastructure.
- Implement the enrichment step in the pipeline: optionally call the LLM with each new listing + the app's enrichment prompt. Results merge into metadata. This runs between filter and rate.
- The enrichment prompt is app-provided (e.g. "Estimate commute time to Auckland CBD. Describe the neighbourhood character.").

**Testing**:
- Chat: ask "show me my top 3 listings" and verify it queries the database and responds with real data
- Chat: say "I'm now open to considering Ponsonby too" and verify the preference profile is updated
- Enrichment: run pipeline with enrichment enabled, verify metadata is augmented with enrichment data

**Success criteria**:
- [ ] Chat agent can query and discuss listings from the database
- [ ] Chat agent can update the preference profile
- [ ] Chat streams responses to the webview
- [ ] Enrichment step adds context to listing metadata
- [ ] Enrichment data is visible in the listing cards

### Phase 7: Scheduling + Polish

**Goal**: Automatic pipeline scheduling, stale listing handling, and UX polish.

**Implementation**:
- Pipeline timer: configurable interval (default: every 4 hours), runs the discovery pipeline automatically. Status visible in the UI.
- Stale listing handling: if a listing's source URL returns 404 or the listing disappears from search results, mark it as archived with a reason.
- Pipeline status UI: show last run time, next scheduled run, run stats (discovered/new/rated), and a manual "run now" button.
- Preference profile viewer: read-only view of both living documents, accessible from the UI.
- Notification badge: highlight new unrated listings in the feed tab.

**Testing**:
- Verify the timer fires and runs the pipeline
- Verify stale listings are detected and archived
- Verify the pipeline status UI reflects real run data

**Success criteria**:
- [ ] Pipeline runs automatically on schedule
- [ ] Stale listings are handled gracefully
- [ ] Pipeline status is visible in the UI
- [ ] Both living documents are viewable in the UI
- [ ] New listings are highlighted until rated

## 5. Open Questions

These need decisions during implementation. None are blockers for Phase 1.

- **Discovery agent output format**: Should the discovery agent return all listings in one `generateObject` call per page, or stream them out one at a time? Batch extraction is simpler; streaming lets us show progress and handle partial failures.
- **Calibration synthesis cadence**: Start with every 5 overrides. But should we also re-synthesize on a timer, or only on demand? The calibration log could drift if the user rates many listings in a burst.
- **Stale listing detection**: Actively re-checking source URLs is expensive and rate-limited. Alternative: mark listings as stale after N days without appearing in fresh search results. Needs experimentation.
- **Interview completion signal**: How does the interview agent know when the preference profile is "good enough"? Could use a minimum set of fields from the Zod schema as a checklist, or let the agent judge based on conversation quality.
- **Multimodal analysis**: Image analysis (e.g. "this house has a nice garden") would improve rating quality significantly. Worth adding in Phase 3 or deferring? Depends on model cost and whether TradeMe image URLs are directly fetchable.
- **Model selection per task**: Different pipeline steps have different cost/quality tradeoffs. Discovery extraction could use a cheaper model; rating might benefit from a stronger one. Should model be configurable per step?
- **Source tool error handling**: What happens when a source tool fails mid-pipeline? Retry? Skip that source? Fail the whole run? Needs a strategy per-source.

## 6. Future Enhancements

Not in scope for the initial implementation, but worth keeping in mind.

- **Multi-source deduplication**: Cross-source matching (same listing on TradeMe and another platform) using LLM-based fuzzy matching on address + images.
- **Listing change tracking**: Detect when a listing's price drops or description changes between pipeline runs. Surface these as events in the feed.
- **Export / share**: Export shortlisted listings as a PDF or shareable link.
- **Map view**: Plot listings on a map with rating-based colour coding.
- **Market analytics**: Aggregate stats over time — price trends, new listing velocity, competition metrics.
- **Multi-device sync**: Replicate the SQLite database to another device. Could use Turso/libSQL for this eventually.
- **Browser automation sources**: For JS-rendered listing sites, provide source tools that use Playwright/CDP instead of plain `fetch`.

## 7. Success Metrics

**The system is working when**:

- A new user can complete the interview and get a preference profile in under 10 minutes.
- The pipeline discovers and rates new listings without manual intervention.
- AI ratings correlate with user ratings over time (measured by average override magnitude decreasing).
- The user checks the feed instead of manually browsing TradeMe.
- Adding a new domain (e.g. job hunting) requires only a Zod schema and source tools — no changes to the shared package.
