# Columnist-DB Local-First RAG Roadmap

## Objective
Position Columnist-DB as the go-to client-side RAG layer for AI assistants, browser copilots, and edge agents that need hybrid search, privacy, and offline capabilities while complementing hosted backends like Convex or Supabase.

## Phase 1 (Weeks 1-2): Core & Examples
1. **Test Hardening**
   - Extend Vitest coverage for Columnist core (vector search, TF-IDF, retries, sync adapters) using the new indexedDB helpers.
   - Add integration suites for `RAGDatabase` chunking/search to guarantee deterministic hybrid results under fake-indexeddb.
2. **Reference Examples**
   - `examples/browser-memory-assistant`: Next.js page indexing user notes with `useColumnist` + `MemoryManager` hooks; hybrid search UI.
   - `examples/mcp-memory-server`: Minimal MCP server exposing Columnist search/addDocument tools.
   - Provide npm scripts (`npm run example:<name>`) and README guides for both.

## Phase 2 (Weeks 3-4): DX & Scaffolding
1. **Scaffold CLI**
   - Publish `create-columnist-app` (or equivalent npm init) that bootstraps schema files, hooks, fake-indexeddb tests, and the Vitest alias config.
2. **Hooks Coverage & Docs**
   - Add Vitest + RTL tests for `packages/hooks` (loading states, document ingestion, search results, error handling).
   - Refresh docs/README with walkthroughs showing how to integrate hooks in React/Next projects.

## Phase 3 (Weeks 4-5): Observability & Backend Bridges
1. **Telemetry & Metrics**
   - Expose structured metrics (cache hit rates, vector dims, per-table stats) via API; optional logging hooks for debugging hybrid search.
   - Document how to inspect these metrics in devtools or CLI.
2. **Sync Bridge Tutorials**
   - Add guides + samples showing Columnist as the device cache while Supabase/Convex handle multi-user state (e.g., SyncManager + REST/Supabase adapter).
   - Emphasize “local-first + hosted backend” workflows so teams can mix privacy/offline benefits with cloud collaboration.

## Success Criteria
- `npm test` runs all core + rag-db suites locally without building packages.
- Example apps demonstrate local hybrid search out of the box; docs highlight privacy/offline advantages.
- Scaffold + hooks tests give new devs a frictionless DX.
- Metrics/logging + sync tutorials position Columnist as the complementary client memory layer beside hosted DBs.