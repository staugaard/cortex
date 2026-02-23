import type { ElectrobunConfig } from "electrobun";

const useCefRenderer = process.env.ELECTROBUN_RENDERER === "cef";
const remoteDebugPort = process.env.ELECTROBUN_REMOTE_DEBUG_PORT;

const platformBuildConfig = useCefRenderer
	? {
			bundleCEF: true,
			defaultRenderer: "cef" as const,
			...(remoteDebugPort
				? {
						chromiumFlags: {
							"remote-debugging-port": remoteDebugPort,
						},
					}
				: {}),
		}
	: {
			bundleCEF: false,
			defaultRenderer: "native" as const,
		};

export default {
	app: {
		name: "react-tailwind-vite",
		identifier: "reacttailwindvite.electrobun.dev",
		version: "0.0.1",
	},
	build: {
		// Vite builds to dist/, we copy from there
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
		},
		mac: { ...platformBuildConfig },
		linux: { ...platformBuildConfig },
		win: { ...platformBuildConfig },
	},
} satisfies ElectrobunConfig;
