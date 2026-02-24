import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initRpcBridge } from "./rpc";
import "./index.css";

initRpcBridge();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
