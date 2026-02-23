# @cortex/chat-core

Phase 1 foundation package for shared chat infrastructure in the Cortex monorepo.

This package currently provides:

- stable subpath exports for future shared modules
- runtime-boundary compile checks for webview-safe vs Bun-only modules
- placeholder contracts that keep import surfaces stable while implementation is added in later phases

Phase 1 intentionally does not include transport, persistence, or agent runtime behavior.
