import { afterEach } from "bun:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
	url: "http://localhost",
	pretendToBeVisual: true,
});

const { window } = dom;
globalThis.window = window as unknown as Window & typeof globalThis;
globalThis.self = window as unknown as typeof globalThis;
globalThis.document = window.document;
globalThis.navigator = window.navigator;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.Text = window.Text;
globalThis.Element = window.Element;
globalThis.Event = window.Event;
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.MouseEvent = window.MouseEvent;
globalThis.CustomEvent = window.CustomEvent;
globalThis.FocusEvent = window.FocusEvent;
globalThis.MutationObserver = window.MutationObserver;
globalThis.DOMParser = window.DOMParser;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = (callback) =>
	setTimeout(() => callback(Date.now()), 0) as unknown as number;
globalThis.cancelAnimationFrame = (handle) => {
	clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
};

if (!globalThis.ResizeObserver) {
	globalThis.ResizeObserver = class ResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

if (!window.matchMedia) {
	window.matchMedia = (query) =>
		({
			matches: false,
			media: query,
			onchange: null,
			addListener() {},
			removeListener() {},
			addEventListener() {},
			removeEventListener() {},
			dispatchEvent() {
				return false;
			},
		}) as MediaQueryList;
}

const { cleanup } = await import("@testing-library/react");

afterEach(() => {
	cleanup();
});
