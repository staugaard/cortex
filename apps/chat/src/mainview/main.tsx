import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initChatRpcBridge } from "./chat-rpc";
import "./index.css";

initChatRpcBridge();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
