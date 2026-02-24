
# Listing Hunter

An AI-powered personal tool for finding, rating, and tracking listings across job-hunt, house-hunt, and similar search-and-evaluate workflows.

## The Problem

Searching for a house (or a job, or a car) involves monitoring multiple sources daily, mentally filtering out irrelevant listings, remembering what you've already seen, and gradually refining what you actually want. It's tedious, repetitive, and poorly served by existing tools that offer basic saved searches and email alerts.

## The Idea

An AI agent that learns what you're looking for, continuously scans for new listings, rates them on your behalf, and gets better over time as you provide feedback. Configuration happens through conversation, not forms. The system builds a nuanced understanding of your preferences — including the subtle stuff that doesn't fit neatly into filters.

## How It Works

### Setup: The Interview

The user has a conversation with the AI. The AI interviews the user to understand what they're looking for — priorities, dealbreakers, nice-to-haves, tradeoffs they're willing to make. This conversation produces a **preference profile**: a natural language document that captures the user's intent in plain English.

This document becomes part of the AI's system prompt for all future operations. The user can revisit the interview at any time to update their preferences through conversation.

### The Pipeline

A scheduled job runs periodically and executes the following steps, all AI-driven:

1. **Discover** — Find new listings from configured sources since the last run
2. **Deduplicate** — Identify and merge duplicate listings across sources
3. **Filter** — Remove listings that already exist in the database
4. **Enrich** — Pull in supplementary context (location data, market comparisons, commute info, neighbourhood details)
5. **Rate** — Score each listing against the preference profile and calibration log
6. **Store** — Insert rated listings into the database

### The Feed

The primary UI is a listing feed, not a chat window. It shows:

- **New unrated listings** highlighted and sorted by AI-predicted rating
- **Easy inline rating controls** — the user rates each listing quickly, with an optional text field to note why
- **Top-rated listings** — a shortlist view of the highest rated listings across all time

### The Feedback Loop

When the user rates a listing differently than the AI predicted, this override is captured along with any reasoning the user provides. Over time, these overrides are synthesized into a **calibration log**: a second natural language document that describes the user's revealed preferences — the patterns in what they rate higher or lower than expected.

This document is also included in the AI's system prompt, alongside the preference profile. Together, the two documents give the AI both the user's stated preferences and their demonstrated preferences.

### The Chat

A chat interface is available alongside the feed. It shares context with the listing database and can be used to:

- Refine preferences ("I'm now open to considering New Lynn too")
- Ask questions about listings ("Why did you rate this one so high?")
- Search and filter ("Show me everything under 900k with a flat section")
- Compare listings ("Compare my top 3 side by side")
- Analyse the market ("What's the average price of 3-beds in Titirangi this month?")

## Two Living Documents

The system's intelligence lives in two plain-text documents that shape the AI's behaviour:

**Preference Profile** — Generated from the interview. Captures explicit wants, needs, and dealbreakers in natural language. Human-readable and directly editable.

> *Example: "Mick is looking for a 3-4 bedroom house in West Auckland, ideally Titirangi or surrounding suburbs. Budget is $850-950k. Must have native bush feel. Strongly prefers character homes over new builds. Proximity to walking tracks is highly valued. Dealbreakers: flood zones, leasehold, apartments."*

**Calibration Log** — Synthesized from rating overrides. Captures revealed preferences and taste patterns that emerge from actual rating behaviour.

> *Example: "Mick consistently rates higher than expected: properties with large native trees, houses with separate studio/office space, older weatherboard construction. Consistently rates lower: properties on busy roads even when other criteria match, open-plan layouts. Notable: rated 87 Springfield Rd a 9 despite being over budget — proximity to Waitaks trail entrance was decisive."*

Both documents are periodically re-synthesized by the AI as new data accumulates, keeping them concise and current rather than endlessly appending.

## Tech Stack

- **Bun** — Runtime, server, task runner
- **SQLite** — Listings, ratings, source cursors, documents
- **ai-sdk** — All AI interactions (interview, pipeline, chat, rating)
- **React** — Feed UI, rating controls, chat interface

Single process, local-first, no infrastructure. Runs on one machine.

## Domains

The foundation is domain-agnostic. The same architecture applies to:

- House hunting
- Job hunting
- Car buying
- Rental searching
- Any search-evaluate-decide workflow

The domain-specific parts are the source connectors and the enrichment step. Everything else — the interview, the rating loop, the two-document prompt system, the feed UI — is reusable.

## Open Questions

- **Rating scale and mechanics** — Resolution (1-5? 1-10? thumbs?), cold start behavior, outlier handling
- **Source configuration** — Built-in per domain vs. user-configured
- **Enrichment depth** — External API integration (maps, council data) vs. simpler scraping
- **Deduplication approach** — Fuzzy matching (address + images) vs. simpler heuristics
- **Calibration synthesis cadence** — After N ratings? Time-based? On-demand?
- **Stale listing handling** — Auto-hide expired listings or manual archive?
- **Multimodal analysis** — Image analysis in V1 or future enhancement?
- **Interview completion signal** — How does the system know when the preference profile is sufficient?