# Browser Memory Assistant Example

This example shows how to build a fully client-side memory assistant that runs Columnist-DB entirely in the browser. It reuses the same primitives that power the `/chat` and `/chat-enhanced` demos in this repo, but packages them as a standalone Next.js 15 app so you can copy it into your own projects.

## What This Example Includes

- Columnist schema and IndexedDB initialization dedicated to note-sized memories
- React hook (`useBrowserMemoryAssistant`) that wires local retrieval to UI state
- Hybrid search UI with support for document ingestion, query history, and LLM context export
- Local deterministic embeddings by default, with optional OpenAI answer synthesis from the UI

> **Status**: Runnable example. It works end-to-end with the built-in local embedding provider, and the optional API key field enables direct OpenAI answer synthesis from the browser.

## Getting Started

1. Install dependencies from the repo root:
   ```bash
   npm install --prefix examples/browser-memory-assistant
   ```
2. Start the dev server:
   ```bash
   npm run example:browser-memory-assistant
   ```
3. Visit http://localhost:3100 to load the standalone assistant UI.

## File Map

- `src/lib/createBrowserMemoryClient.ts` - wraps `Columnist.init` with the memory schema and local embedder registration.
- `src/hooks/useBrowserMemoryAssistant.ts` - orchestrates ingestion, local retrieval, optional OpenAI answer synthesis, and UI state.
- `src/app/page.tsx` - sample Next.js route that binds the hook to a Tailwind-ready UI.

## Next Steps

- Add proper authentication for the optional OpenAI API key entry.
- Extract the shared UI components (document list, search drawer, and so on) into reusable packages.
- Record a walkthrough video and link it from `docs/MEMORY_EXAMPLES.md`.
