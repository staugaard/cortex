/**
 * Electrobun RPC schema for this app.
 *
 * Add request/message types here as your app grows. The schema is shared
 * between the Bun (native) side and the webview (React) side.
 *
 * Shape:
 *   bun.requests    – webview can call these (request/response)
 *   bun.messages    – webview can send these (fire-and-forget)
 *   webview.requests – bun can call these (request/response)
 *   webview.messages – bun can send these (fire-and-forget)
 */
export type AppSchema = {
	bun: {
		requests: {};
		messages: {};
	};
	webview: {
		requests: {};
		messages: {};
	};
};
