# MCP Memory Server Example

This example packages a lightweight local tool server around Columnist-DB memory APIs. It mirrors the tool shapes surfaced in `/chat-enhanced` and can be launched beside any MCP-compatible IDE or AI client while you are still working on full transport integration.

## Capabilities

- Local Columnist instance so the server keeps data on the device
- Two primary tools: `add_memory` for ingestion and `search_memory` for recall
- Lightweight stdio JSON command loop for manual testing and early client integration
- Built-in local embedding provider, so the example works without external services

> **Status**: Runnable local example. The server accepts newline-delimited JSON commands over stdio, stores data in Columnist, and uses the built-in local embedding provider. It is still not a full `@modelcontextprotocol/sdk` transport.

## Usage

1. Install dependencies:
   ```bash
   npm install --prefix examples/mcp-memory-server
   ```
2. Start the dev server with file watching:
   ```bash
   npm run example:mcp-memory-server
   ```
3. Point your client to the generated stdio server, or use `node src/server.ts` for manual testing.

## Key Files

- `src/server.ts` - boots the stdio loop, loads Columnist, and registers the tools.
- `src/tools/addMemory.ts` - normalizes incoming payloads and persists them.
- `src/tools/searchMemories.ts` - wraps `db.search` and vector similarity scoring.

## Roadmap

- Swap the lightweight JSON line loop for `@modelcontextprotocol/sdk` if you need full MCP handshake support.
- Add persistence for auth/config via `~/.columnist/mcp-memory-server.json`.
- Publish a Dockerfile so teams can deploy the same server next to hosted Columnist replicas.
- Tie telemetry into the `docs/ROADMAP_LOCAL_RAG.md` observability goals.
