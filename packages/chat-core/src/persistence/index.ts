import { Database } from "bun:sqlite";
import type {
	ConversationRecord,
	ConversationSummary,
	GetConversationListRequest,
	GetConversationListResponse,
	GetConversationRequest,
	GetConversationResponse,
	SaveMessagesRequest,
	SaveMessagesResponse,
} from "../rpc";
import type {
	BunRuntimeFlag,
	RequireBunRuntime,
} from "../internal/runtime-tags";

const assertBunRuntime: RequireBunRuntime<BunRuntimeFlag> = true;
void assertBunRuntime;

const SCHEMA_VERSION = 2;
const DEFAULT_TITLE = "New Conversation";
const FALLBACK_TITLE_MAX_LENGTH = 72;
const DEFAULT_GENERATE_TITLE_TIMEOUT_MS = 750;

interface ConversationSummaryRow {
	session_id: string;
	title: string | null;
	created_at: number;
	updated_at: number;
}

interface ConversationRow extends ConversationSummaryRow {
	metadata_json: string | null;
	messages_json: string;
	title_is_fallback: number;
}

export interface GenerateTitleInput<UI_MESSAGE> {
	sessionId: string;
	messages: UI_MESSAGE[];
	metadata?: Record<string, unknown>;
	fallbackTitle: string;
}

export interface CreateSqliteChatRepositoryOptions<UI_MESSAGE> {
	dbPath: string;
	generateTitle?: (
		input: GenerateTitleInput<UI_MESSAGE>,
	) => Promise<string | undefined>;
	generateTitleTimeoutMs?: number;
	onConversationUpdated?: (
		conversation: ConversationSummary,
	) => void | Promise<void>;
	createSessionId?: () => string;
	now?: () => number;
}

export interface ChatRepository<UI_MESSAGE> {
	getConversationList: (
		params: GetConversationListRequest,
	) => GetConversationListResponse;
	getConversation: (
		params: GetConversationRequest,
	) => GetConversationResponse<UI_MESSAGE>;
	saveMessages: (
		params: SaveMessagesRequest<UI_MESSAGE>,
	) => Promise<SaveMessagesResponse>;
	close: () => void;
}

function ensureSchema(db: Database, now: () => number): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			applied_at INTEGER NOT NULL
		)
	`);

	const versionRow = db
		.query("SELECT MAX(version) AS version FROM schema_migrations")
		.get() as { version: number | null } | null;
	const currentVersion = versionRow?.version ?? 0;
	if (currentVersion >= SCHEMA_VERSION) {
		return;
	}

	if (currentVersion < 1) {
		db.transaction(() => {
			db.exec(`
				CREATE TABLE IF NOT EXISTS conversations (
					session_id TEXT PRIMARY KEY,
					title TEXT,
					metadata_json TEXT,
					messages_json TEXT NOT NULL,
					created_at INTEGER NOT NULL,
					updated_at INTEGER NOT NULL,
					title_is_fallback INTEGER NOT NULL DEFAULT 1
				)
			`);
			db.exec(`
				CREATE INDEX IF NOT EXISTS idx_conversations_created_at_desc
				ON conversations(created_at DESC)
			`);
			db.query(
				"INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
			).run(1, now());
		})();
	}

	if (currentVersion < 2) {
		db.transaction(() => {
			const hasTitleFallbackColumn = db
				.query(
					"SELECT COUNT(*) AS count FROM pragma_table_info('conversations') WHERE name = 'title_is_fallback'",
				)
				.get() as { count: number };
			if (hasTitleFallbackColumn.count === 0) {
				db.exec(
					"ALTER TABLE conversations ADD COLUMN title_is_fallback INTEGER NOT NULL DEFAULT 1",
				);
			}

			db.query(
				"INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
			).run(2, now());
		})();
	}
}

function normalizeTitle(title: string | undefined): string | undefined {
	if (!title) {
		return undefined;
	}
	const normalized = title.replace(/\s+/g, " ").trim();
	if (!normalized) {
		return undefined;
	}
	return normalized.slice(0, FALLBACK_TITLE_MAX_LENGTH);
}

function extractTextFromUnknownMessage(message: unknown): string {
	if (!message || typeof message !== "object") {
		return "";
	}

	const textParts: string[] = [];
	const candidate = message as {
		parts?: unknown;
		content?: unknown;
	};

	if (Array.isArray(candidate.parts)) {
		for (const part of candidate.parts) {
			if (!part || typeof part !== "object") {
				continue;
			}
			const textPart = part as { type?: unknown; text?: unknown };
			if (textPart.type === "text" && typeof textPart.text === "string") {
				textParts.push(textPart.text);
			}
		}
	}

	if (typeof candidate.content === "string") {
		textParts.push(candidate.content);
	}

	return textParts.join(" ").replace(/\s+/g, " ").trim();
}

function getRoleFromUnknownMessage(message: unknown): string | undefined {
	if (!message || typeof message !== "object") {
		return undefined;
	}
	const role = (message as { role?: unknown }).role;
	return typeof role === "string" ? role : undefined;
}

function hasAssistantMessage(messages: unknown[]): boolean {
	for (const message of messages) {
		if (getRoleFromUnknownMessage(message) !== "assistant") {
			continue;
		}
		if (extractTextFromUnknownMessage(message).length > 0) {
			return true;
		}
	}
	return false;
}

function deriveFallbackTitle(messages: unknown[]): string {
	for (const message of messages) {
		if (getRoleFromUnknownMessage(message) !== "user") {
			continue;
		}
		const text = extractTextFromUnknownMessage(message);
		if (text.length > 0) {
			return text.slice(0, FALLBACK_TITLE_MAX_LENGTH);
		}
	}

	for (const message of messages) {
		const text = extractTextFromUnknownMessage(message);
		if (text.length > 0) {
			return text.slice(0, FALLBACK_TITLE_MAX_LENGTH);
		}
	}

	return DEFAULT_TITLE;
}

function parseMetadata(
	metadataJson: string | null,
): Record<string, unknown> | undefined {
	if (!metadataJson) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(metadataJson) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
		return undefined;
	} catch {
		return undefined;
	}
}

function toConversationSummary(row: ConversationSummaryRow): ConversationSummary {
	return {
		sessionId: row.session_id,
		title: row.title ?? undefined,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

async function withTimeout<T>(
	task: Promise<T>,
	timeoutMs: number,
): Promise<T | undefined> {
	if (timeoutMs === Infinity) {
		return task;
	}

	return await new Promise<T | undefined>((resolve, reject) => {
		const timeoutHandle = setTimeout(() => {
			resolve(undefined);
		}, timeoutMs);

		task.then(
			(value) => {
				clearTimeout(timeoutHandle);
				resolve(value);
			},
			(error) => {
				clearTimeout(timeoutHandle);
				reject(error);
			},
		);
	});
}

export function createSqliteChatRepository<UI_MESSAGE>(
	options: CreateSqliteChatRepositoryOptions<UI_MESSAGE>,
): ChatRepository<UI_MESSAGE> {
	const now = options.now ?? (() => Date.now());
	const createSessionId = options.createSessionId ?? (() => crypto.randomUUID());
	const generateTitleTimeoutMs = Math.max(
		0,
		options.generateTitleTimeoutMs ?? DEFAULT_GENERATE_TITLE_TIMEOUT_MS,
	);
	const temporarySessionMap = new Map<string, string>();

	const db = new Database(options.dbPath, { create: true, strict: true });
	db.exec("PRAGMA journal_mode = WAL");
	ensureSchema(db, now);

	const getConversationRowById = db.query(
		`SELECT
			session_id,
			title,
			metadata_json,
			messages_json,
			created_at,
			updated_at,
			title_is_fallback
		 FROM conversations
		 WHERE session_id = ?`,
	);

	const getConversationListWithLimit = db.query(
		`SELECT
			session_id,
			title,
			created_at,
			updated_at
		 FROM conversations
		 ORDER BY created_at DESC
		 LIMIT ?`,
	);

	const getConversationListAll = db.query(
		`SELECT
			session_id,
			title,
			created_at,
			updated_at
		 FROM conversations
		 ORDER BY created_at DESC`,
	);

	const upsertConversation = db.query(
		`INSERT INTO conversations (
			session_id,
			title,
			metadata_json,
			messages_json,
			created_at,
			updated_at,
			title_is_fallback
		)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(session_id) DO UPDATE SET
			title = excluded.title,
			metadata_json = excluded.metadata_json,
			messages_json = excluded.messages_json,
			updated_at = excluded.updated_at,
			title_is_fallback = excluded.title_is_fallback`,
	);

	const updateGeneratedTitleIfFallback = db.query(
		`UPDATE conversations
		 SET title = ?, updated_at = ?, title_is_fallback = 0
		 WHERE session_id = ? AND title_is_fallback = 1
		 RETURNING session_id, title, created_at, updated_at`,
	);

	let isClosed = false;
	const titleGenerationInFlight = new Set<string>();

	function resolveSessionId(sessionId: string): string {
		if (!sessionId.startsWith("tmp:")) {
			return sessionId;
		}

		const existing = temporarySessionMap.get(sessionId);
		if (existing) {
			return existing;
		}

		const canonicalSessionId = createSessionId();
		temporarySessionMap.set(sessionId, canonicalSessionId);
		return canonicalSessionId;
	}

	function scheduleTitleGeneration(input: {
		sessionId: string;
		fallbackTitle: string;
		messages: UI_MESSAGE[];
		metadata?: Record<string, unknown>;
	}): void {
		const generateTitle = options.generateTitle;
		if (
			typeof generateTitle !== "function" ||
			titleGenerationInFlight.has(input.sessionId)
		) {
			return;
		}

		titleGenerationInFlight.add(input.sessionId);
		void (async () => {
			try {
				const generatedTitle = normalizeTitle(
					await withTimeout(
						generateTitle({
							sessionId: input.sessionId,
							messages: input.messages,
							metadata: input.metadata,
							fallbackTitle: input.fallbackTitle,
						}),
						generateTitleTimeoutMs,
					),
				);

				if (
					!generatedTitle ||
					generatedTitle === input.fallbackTitle ||
					isClosed
				) {
					return;
				}

				const updatedConversationRow = updateGeneratedTitleIfFallback.get(
					generatedTitle,
					now(),
					input.sessionId,
				) as ConversationSummaryRow | undefined;
				if (!updatedConversationRow) {
					return;
				}

				const onConversationUpdated = options.onConversationUpdated;
				if (typeof onConversationUpdated === "function" && !isClosed) {
					try {
						await onConversationUpdated(
							toConversationSummary(updatedConversationRow),
						);
					} catch {
						// Notification failures should never break persistence.
					}
				}
			} catch {
				// Save path already committed with fallback title.
			} finally {
				titleGenerationInFlight.delete(input.sessionId);
			}
		})();
	}

	return {
		getConversationList: (params) => {
			const limit = params.limit;
			const hasLimit = typeof limit === "number";
			if (hasLimit && limit <= 0) {
				return { conversations: [] };
			}

			const rows = hasLimit
				? (getConversationListWithLimit.all(limit) as ConversationSummaryRow[])
				: (getConversationListAll.all() as ConversationSummaryRow[]);

			return {
				conversations: rows.map(toConversationSummary),
			};
		},
		getConversation: (params) => {
			const row = getConversationRowById.get(params.sessionId) as
				| ConversationRow
				| undefined;

			if (!row) {
				return { conversation: null };
			}

			return {
				conversation: {
					sessionId: row.session_id,
					title: row.title ?? undefined,
					metadata: parseMetadata(row.metadata_json),
					messages: JSON.parse(row.messages_json) as UI_MESSAGE[],
					createdAt: row.created_at,
					updatedAt: row.updated_at,
				} satisfies ConversationRecord<UI_MESSAGE>,
			};
		},
		saveMessages: async (params) => {
			const canonicalSessionId = resolveSessionId(params.sessionId);
			const currentTime = now();
			const existingRow = getConversationRowById.get(canonicalSessionId) as
				| ConversationRow
				| undefined;

			const rawMessages = params.messages as unknown[];
			const fallbackTitle = deriveFallbackTitle(rawMessages);
			const requestedTitle = normalizeTitle(params.title);
			const existingTitle = normalizeTitle(existingRow?.title ?? undefined);
			const existingTitleIsFallback = existingRow?.title_is_fallback === 1;

			const nextTitle =
				requestedTitle ??
				(existingTitle && !existingTitleIsFallback ? existingTitle : fallbackTitle);
			const nextTitleIsFallback = requestedTitle == null && (existingTitleIsFallback || !existingTitle);

			const metadata = params.metadata ?? parseMetadata(existingRow?.metadata_json ?? null);
			upsertConversation.run(
				canonicalSessionId,
				nextTitle,
				metadata ? JSON.stringify(metadata) : null,
				JSON.stringify(params.messages),
				existingRow?.created_at ?? currentTime,
				currentTime,
				nextTitleIsFallback ? 1 : 0,
			);

			const shouldGenerateTitle =
				nextTitleIsFallback &&
				typeof options.generateTitle === "function" &&
				hasAssistantMessage(rawMessages);

			if (shouldGenerateTitle) {
				scheduleTitleGeneration({
					sessionId: canonicalSessionId,
					fallbackTitle,
					messages: params.messages,
					metadata: params.metadata,
				});
			}

			return {
				sessionId: canonicalSessionId,
				savedAt: currentTime,
			};
		},
		close: () => {
			isClosed = true;
			db.close();
		},
	};
}
