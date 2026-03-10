# Columnist-DB Improvement Plan (7 -> 9/10)

## Context
- Current rating: **7/10** due to ambitious scope but thin validation/testing, limited modularity, and sparse end-to-end guidance.
- Target rating: **9/10** by delivering production-grade reliability, demonstrable RAG quality, polished developer experience, and mature release processes.
- Approach: ship improvements in focused milestones so each layer (core DB, RAG services, DX, observability, QA) reaches parity with claims in the README and technical spec.

## Milestone 1 – Core Engine Hardening
- Expand Vitest coverage for schema handling, migrations, TF-IDF/vector search, retries, and sync; cover packages/core/src/columnist.ts, codecs, and device table flows.
- Extract ErrorRecoveryManager, vector math helpers, and tokenizer utilities into dedicated modules with targeted tests and doc snippets.
- Document lifecycle + transaction flow in docs/TECHNICAL_SPECIFICATION.md, including diagrams for initialization, transactions, and sync hooks.
- Success metric: >80% coverage in packages/core, reproducible IndexedDB + fake-indexeddb test matrix, updated technical docs.

## Milestone 2 – RAG & Search Architecture
- Refactor packages/rag-db/src/rag-database.ts into composable services (chunker, ranker, cache, sync) wired through a clean interface.
- Implement configurable chunking strategies with schemas + benchmarks; verify thresholds, deduplication, and hybrid ranking via integration tests.
- Harden embedding provider interfaces: retries/backoff, mockable adapters, and unit tests for each provider (OpenAI + basic) in packages/plugins.
- Success metric: deterministic hybrid search integration tests, documented chunking/embedding options, >75% coverage in packages/rag-db and packages/plugins.

## Milestone 3 – Developer Experience & Samples
- Add Vitest + React Testing Library suites for packages/hooks (loading/error states, schema changes, document workflows).
- Provide runnable examples (Next.js app, MCP server, CLI usage) linked from README/docs; script installs via an examples/ directory.
- Consider a scaffold command or documented checklist to spin up a Columnist project with schema, hooks, and tests prewired.
- Success metric: green hook tests, documented workflows in README/docs, at least two maintained example apps.

## Milestone 4 – Observability & Performance
- Expose structured metrics (getStats, per-table/index stats, cache hit rates) and optional logging hooks.
- Build automated benchmarks (vector search latency, chunking throughput, cache effectiveness) checked into CI.
- Persist telemetry (opt-in) to IndexedDB/local storage for offline inspection and troubleshooting.
- Success metric: benchmark dashboards or reports in CI, documented metrics API, ability to trace query performance locally.

## Milestone 5 – QA, Security & Release Engineering
- Stand up CI (GitHub Actions) running lint, unit + integration tests per package, coverage thresholds, and benchmark smoke tests.
- Automate versioning/changelogs (Changesets or semantic-release) for all publishable workspaces; document release steps in docs/PUBLISHING.md.
- Expand security docs: encryption model, sync adapter hardening, MCP threat modeling, API key management.
- Success metric: reproducible CI pipeline, automated package publishing, updated security/readiness documentation.

## Timeline & Ownership
- Aim for 5–6 week cadence: each milestone roughly one week with overlapping documentation updates.
- Assign leads per milestone (core, RAG, DX, platform, DevOps) to maintain accountability and ensure tests/docs ship alongside code.

## Definition of Done
- Measurable improvements in coverage, benchmarks, docs, and release automation.
- README + technical spec accurately reflect shipped capabilities.
- External developers can set up, test, and deploy Columnist-DB with confidence, warranting the target **9/10** rating.
