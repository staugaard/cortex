import type { z } from "zod";
import type {
	DocumentType,
	ListingFilter,
	PipelineRunStats,
} from "../types/index.js";

// ─── Bun-side requests (webview calls these) ─────────────────────────────────

export type ListingHunterBunRequests<T extends z.ZodObject<z.ZodRawShape>> = {
	getListings: {
		params: {
			filter: ListingFilter;
			limit?: number;
			offset?: number;
		};
		response: {
			listings: z.infer<T>[];
			total: number;
		};
	};
	getListing: {
		params: { id: string };
		response: z.infer<T>;
	};
	rateListing: {
		params: { id: string; rating: number; note?: string };
		response: { listing: z.infer<T> };
	};
	archiveListing: {
		params: { id: string };
		response: void;
	};
	getDocuments: {
		params: void;
		response: {
			preferenceProfile: string | null;
			calibrationLog: string | null;
		};
	};
	runPipeline: {
		params: void;
		response: { runId: string };
	};
};

// ─── Webview messages (bun sends these, fire-and-forget) ─────────────────────

export type ListingHunterWebviewMessages = {
	listingsUpdated: { newCount: number };
	pipelineStatus: {
		runId: string;
		status: string;
		stats?: PipelineRunStats;
	};
	documentsUpdated: { type: DocumentType };
};
