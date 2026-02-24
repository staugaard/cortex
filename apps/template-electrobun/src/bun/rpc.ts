import { BrowserView } from "electrobun/bun";
import type { AppSchema } from "../mainview/types";

export const appRpc = BrowserView.defineRPC<AppSchema>({
	handlers: {
		requests: {},
		messages: {},
	},
});
