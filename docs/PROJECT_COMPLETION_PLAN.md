# Project Completion Plan

## Goal

Take `columnist-db` from a promising local prototype to a shippable MVP with:

- publishable packages
- a consistent public API
- working examples
- honest documentation
- enforced quality gates

## Current Reality

The project already has meaningful core implementation in place:

- core CRUD, search, vector search, sync, memory, and RAG code exist
- the local Vitest suite passes
- the Next.js app builds locally

But the repo is not yet MVP-ready because:

- package outputs are not being built for publishing
- the public API and local usages have drifted
- TypeScript does not pass end-to-end
- several demo and MCP surfaces are still mockups or scaffolding
- build settings currently suppress lint/type failures
- documentation does not fully match the actual implementation

## MVP Definition

The MVP should include:

- `columnist-db-core`
- `columnist-db-hooks`
- `rag-db`
- `columnist-db-plugin-openai-embedding`
- one real browser example
- one real MCP example or a clearly non-MVP downgrade

The MVP should not depend on:

- mock MCP calls presented as real integration
- placeholder LLM behavior
- unpublished local-only assumptions
- disabled lint/type gates

## Workstreams

### 1. Lock The Product Surface

Decide exactly what ships in MVP and what is post-MVP.

Tasks:

- define the supported package list
- define the canonical public API for initialization, schema definition, search, vector search, sync, and embeddings
- remove or isolate legacy API shapes
- mark experimental areas explicitly

Primary files:

- `README.md`
- `packages/core/src/index.ts`
- `packages/core/src/types.ts`
- `packages/core/src/columnist.ts`

Acceptance criteria:

- one documented API path exists for each core workflow
- examples, docs, and packages all target the same API

### 2. Repair Package Publishing

Make each package build real distributable outputs.

Tasks:

- add or fix `build` scripts for all publishable packages
- generate `dist/` with JS and declaration files
- verify `exports`, `main`, `module`, and `types` entries
- remove broken package references such as nonexistent local dependencies
- add `npm pack --dry-run` validation for each package

Primary packages:

- `packages/core`
- `packages/hooks`
- `packages/rag-db`
- `packages/plugins/openai-embedding`

Acceptance criteria:

- every publishable package packs with code, not just `package.json`
- each package can be imported from its packed output

### 3. Fix API And Type Drift

Bring source, examples, docs, and tests back into agreement.

Tasks:

- fix `Columnist.init` call sites to match the actual contract
- export any required public types or stop depending on internals
- remove stale imports and invalid example code
- fix test and helper typing mismatches
- make `tsc --noEmit` pass

Primary files:

- `src/lib/database.ts`
- `examples/browser-memory-assistant/src/lib/createBrowserMemoryClient.ts`
- `examples/browser-memory-assistant/src/hooks/useBrowserMemoryAssistant.ts`
- `examples/mcp-memory-server/src/server.ts`
- `examples/mcp-memory-server/src/tools/*`
- `packages/rag-db/demo/react-demo.tsx`

Acceptance criteria:

- root typecheck passes
- exported APIs are the same APIs used by examples and docs

### 4. Replace Mockups With Real Implementations

Remove ambiguity between demo behavior and real functionality.

Tasks:

- replace mock MCP UI behavior with real runtime calls or remove it from MVP
- replace mock embedding behavior where the docs imply real embeddings
- replace hardcoded similarity scores with actual search result scores
- either implement real LLM handoff flows or label them as extension points only

Primary files:

- `src/components/MCPIntegration.tsx`
- `src/hooks/useChatDB.ts`
- `examples/browser-memory-assistant/src/lib/createBrowserMemoryClient.ts`
- `examples/browser-memory-assistant/src/hooks/useBrowserMemoryAssistant.ts`
- `examples/mcp-memory-server/src/server.ts`

Acceptance criteria:

- no mock behavior is presented as production-ready
- demo UX clearly reflects real capabilities

### 5. Align Documentation

Rewrite documentation so it is accurate and useful for external users.

Tasks:

- update Quick Start to use the real API
- document one official install path per package
- document one official example flow for browser and MCP usage
- remove stale repo-state notes and branch assumptions
- add a clear section for supported vs experimental features

Primary files:

- `README.md`
- `docs/PUBLISHING.md`
- `docs/MEMORY_EXAMPLES.md`
- `docs/PHASE_2_PLAN.md`
- example READMEs

Acceptance criteria:

- a new user can install, run, and test the project from docs alone
- docs no longer promise behavior that is still scaffolded

### 6. Enforce Quality Gates

Turn the repo into something that fails loudly when broken.

Tasks:

- re-enable lint and TypeScript enforcement during build or CI
- reduce lint backlog to an acceptable MVP baseline
- keep unit tests green
- add smoke tests for package packing/imports
- add example validation checks
- add CI workflow coverage

Primary files:

- `next.config.mjs`
- `package.json`
- package `tsconfig.json` files
- CI workflow files

Acceptance criteria:

- `npm run lint` passes
- `npx tsc -p tsconfig.json --noEmit` passes
- `npm test` passes
- package smoke checks pass in CI

### 7. Release Preparation

Prepare the repo for a credible MVP release.

Tasks:

- align versions across packages
- document release steps
- prepare changelog or release notes
- define migration notes for any API breaking changes
- confirm publish workflow

Acceptance criteria:

- packages can be versioned and published cleanly
- release steps are documented and repeatable

## Recommended Sequence

### Phase A: Foundation

1. lock MVP scope
2. repair package publishing
3. fix API/type drift

### Phase B: Reality Check

4. replace or remove mock/scaffolded paths
5. align docs and examples

### Phase C: Ship Readiness

6. enforce quality gates
7. prepare release workflow

## Practical Milestones

### Milestone 1: Package-Correct

- all packages build
- all packages pack correctly
- root typecheck passes

### Milestone 2: Example-Correct

- browser example is real and runnable
- MCP example is real or explicitly downgraded from MVP
- docs match implementation

### Milestone 3: Release-Correct

- lint, typecheck, tests, and pack checks run in CI
- release steps are documented
- MVP checklist passes

## MVP Acceptance Checklist

- package install works from packed artifacts
- database initialization works from public API
- schema definition works from documented API
- CRUD operations work
- text search works
- vector search works with a real or clearly documented embedding provider path
- one browser example works from its README
- one MCP path works or is explicitly excluded from MVP
- docs are accurate
- lint, typecheck, tests, and pack checks pass

## Immediate Next Step

Start with package integrity and API/type reconciliation first.

Reason:

- these are the current hard blockers to shipping
- they affect every example, package, and documentation path
- they are the fastest way to convert the repo from prototype to product
