# Model Context Protocol (MCP) — A Practical, Readable Guide

> **What this is:** A single-file, human-friendly overview of MCP that’s great for day‑to‑day reference. It explains the moving parts, shows the core message shapes, and gives checklists and patterns you’ll actually use when building servers and clients.

---

## TL;DR (the mental model)

- **MCP is a two‑layer protocol**:
  - **Data layer (JSON‑RPC 2.0):** lifecycle/init, primitives (Tools, Resources, Prompts), plus client-exposed features (Sampling, Elicitation, Logging), and Notifications.
  - **Transport layer:** how messages get there (either **stdio** or **Streamable HTTP**). Same JSON‑RPC semantics regardless of transport.
- **Think “USB‑C for AI apps.”** Servers expose capabilities; clients/hosts plug into them and coordinate how the LLM uses those capabilities.
- **Three server primitives** you’ll use all the time:
  1) **Tools** (active actions the model can call),
  2) **Resources** (readable context you can fetch/subscribe to),
  3) **Prompts** (reusable, parameterized prompt templates).
- **Client features** complete the loop:
  - **Sampling** (server asks the client/host to call an LLM),
  - **Elicitation** (server asks the user for missing inputs),
  - **Roots** (client tells servers what filesystem areas are in-bounds),
  - **Notifications/Logging** (keep state in sync; debug).

---

## 1) Participants & vocabulary

- **Host**: the end-user application (e.g., IDE, chat app) orchestrating one or many server connections.
- **Client**: a per-server protocol endpoint the host spins up; one client ↔ one server.
- **Server**: implements MCP and exposes **Tools**, **Resources**, **Prompts** over JSON‑RPC.

**One host → many clients → many servers.** Clients keep a dedicated connection per server; hosts decide when to involve which server and how to present results to users.

---

## 2) Lifecycle (stateful handshake)

**Initialize** first. The client sends `initialize` with:
- `protocolVersion` (e.g., `2025-06-18`) — negotiate compatibility.
- `capabilities` — what each side supports (e.g., `tools`, `resources`, `prompts`, `notifications`, `roots`, `sampling`, `elicitation`).
- `clientInfo` / `serverInfo` — name + version for debugging/telemetry.

If negotiation fails, disconnect. After init, both parties know what features can be used.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": { "tools": { "listChanged": true } },
    "clientInfo": { "name": "my-client", "version": "1.0.0" }
  }
}
```

**Notifications** keep things fresh without polling (no response expected). Example: when a server’s feature list changes, it emits `notifications/<feature>/list_changed` and the client re‑lists.

```json
{ "jsonrpc": "2.0", "method": "notifications/tools/list_changed" }
```

---

## 3) Server primitives

### 3.1 Tools (model‑invoked actions)

**Use when:** the LLM needs to _do_ something — call an API, run a query, modify a file, etc.

**Declare capability:**
```json
{ "capabilities": { "tools": { "listChanged": true } } }
```

**Discover** available tools:
```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }
```

**Call** a tool:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "search_flights",
    "arguments": { "from": "AMS", "to": "SFO", "date": "2025-10-30" }
  }
}
```

**Response content** is an array of content blocks (text, images, binary, embedded resources, structured output).

**Design tips**  
- Names should be short, verbs, and stable: `search_flights`, `create_issue`, `run_sql`.  
- Make **arguments JSON‑Schema** strict but ergonomic (enums, defaults, descriptions).  
- Prefer **idempotent** semantics where you can; document side effects.  
- Emit **`list_changed`** when tool availability changes (auth, org, project).

---

### 3.2 Resources (fetchable context)

**Use when:** you want to provide **data** the host/LLM can ingest (files, schemas, docs, rows, blobs).

**Declare capability:**
```json
{ "capabilities": { "resources": { "subscribe": true, "listChanged": true } } }
```

**List** resources (paginated):
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/list",
  "params": { "cursor": null }
}
```

**Read** a resource:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/read",
  "params": { "uri": "file:///project/src/main.rs" }
}
```

**Subscribe** to updates (optional):
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "resources/subscribe",
  "params": { "uri": "file:///project/src/main.rs" }
}
```

**Content forms:** `text`, `blob` (base64), plus optional **annotations** like `audience: ["user","assistant"]` and `priority: 0.0–1.0` to hint importance.

**Design tips**  
- Use stable **URIs** (`file://`, `https://`, `git://`, or custom schemes).  
- Keep resources small and composable; prefer pagination/filters.  
- Offer **resource templates** via URI templates when parameters are needed.  
- Emit `notifications/resources/list_changed` when the catalog changes.

---

### 3.3 Prompts (parameterized templates)

**Use when:** you have reusable task starters (few‑shot, structured instructions) the **user** can explicitly invoke.

**Declare capability:**
```json
{ "capabilities": { "prompts": { "listChanged": true } } }
```

**List** prompts:
```json
{ "jsonrpc": "2.0", "id": 1, "method": "prompts/list" }
```

**Get** a prompt (with arguments):
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "prompts/get",
  "params": {
    "name": "code_review",
    "arguments": { "code": "def hello():\n  print('world')" }
  }
}
```

**Design tips**  
- Keep argument schema minimal; include clear `description` strings.  
- Prompts can embed **resources** in their `messages` content array.  
- Emit `notifications/prompts/list_changed` when applicable.

---

## 4) Client‑exposed features

### 4.1 Sampling (server asks the client to call an LLM)

Servers can request the host to perform a model completion/generation — useful to stay **model‑agnostic** and avoid server‑side API keys. Messages can be **text/image/audio** and can include model hints/preferences.

**Typical flow:** server sends `sampling/complete` with messages → client handles auth/rate‑limits/model choice → returns completion chunks or a final response.

**Good citizenship:** keep requests bounded, explain purpose in your message preamble, and expect human‑in‑the‑loop approvals in many hosts.

---

### 4.2 Elicitation (ask the user for missing inputs)

Servers can pause a workflow to request structured input from the user (e.g., “confirm booking?” “seat preference?”). You provide a **JSON‑Schema** describing the expected shape; the host renders appropriate UI and returns values.

**Guidelines:** never ask for **sensitive secrets** via elicitation; keep prompts specific and explain what happens with the data.

---

### 4.3 Roots (filesystem boundaries)

Hosts can expose **roots** (a set of `file://` URIs) so servers understand which directories are in‑scope. Roots can change over time (e.g., project switch), and clients can send `notifications/roots/list_changed` to inform servers.

**Rule of thumb:** servers treat roots as **hints + constraints**, but **actual access is always mediated by the client**.

---

## 5) Transports (same protocol, different pipes)

### 5.1 stdio

- Client launches server as a subprocess.  
- Server reads **stdin**, writes **stdout** with newline‑delimited JSON‑RPC messages (no embedded newlines).  
- `stderr` allowed for human‑readable logs.

### 5.2 Streamable HTTP (the modern remote transport)

- One **MCP endpoint** (e.g., `POST /mcp` and `GET /mcp`).  
- Client POSTs JSON‑RPC requests; server **may** reply via SSE to stream multiple frames before the final JSON‑RPC response.  
- Optional **GET** can open a server‑initiated SSE stream for asynchronous server→client messages.

**Security essentials (HTTP):**
- Validate the `Origin` header (protect against DNS rebinding).  
- Bind to `127.0.0.1` locally; don’t expose `0.0.0.0` casually.  
- Require authentication (bearer/API key/custom headers; OAuth recommended to acquire tokens).

---

## 6) Notifications (stay in sync)

- Feature catalogs: `notifications/tools/list_changed`, `notifications/resources/list_changed`, `notifications/prompts/list_changed`.  
- Roots updates: `notifications/roots/list_changed`.  
- Servers/clients can define other progress/log notifications where supported.  
- Notifications are JSON‑RPC **without** `id` (no response expected).

---

## 7) Putting it together — reference flows

**A) Initialization**
1. Client → `initialize` (protocolVersion, capabilities, clientInfo)
2. Server ↔ returns compatibility + `serverInfo`
3. Optional: client starts a **GET SSE** stream (HTTP) to receive async server messages

**B) Discovery & use**
1. Client → `tools/list` / `resources/list` / `prompts/list` (paginate if needed)
2. Client → `tools/call` or `resources/read` or `prompts/get`
3. Server → returns `content[]` blocks
4. Server → may emit `notifications/*/list_changed`; client re‑lists

**C) Rich interactions**
- Server → `sampling/complete` to ask host to call an LLM
- Server → ask user via elicitation request (JSON‑Schema form/UI rendered by host)

---

## 8) Error handling & robustness

- **Be explicit**: use JSON‑RPC error codes + messages the user can act on.
- **Validate inputs**: enforce JSON‑Schema at boundaries; reject unknown fields.
- **Time bounds**: cancel politely; support idempotent retries where possible.
- **Backpressure**: stream results (SSE) for long operations; send progress notifications (if available).
- **Security**: least privilege, audited logging, human‑in‑the‑loop for destructive ops. Treat HTTP origins & auth seriously, especially for **remote servers**.

---

## 9) Server author checklist

- [ ] Pick an official SDK (TS, Python, Go, etc.).  
- [ ] Implement **initialize** + declare accurate capabilities.  
- [ ] Define **Tools** (schemas, side‑effects, return content) and/or **Resources** (URIs, read, subscribe) and/or **Prompts** (arguments, messages).  
- [ ] Consider **Sampling** and **Elicitation** to offload model calls and gather inputs.  
- [ ] Implement **notifications** where applicable (`list_changed`, updates).  
- [ ] Add **auth** + scoping (org/project/user).  
- [ ] Provide **resource templates** or filters for scale.  
- [ ] Document example requests/responses.  
- [ ] Test with **MCP Inspector** and a real host.

---

## 10) Client/host author checklist

- [ ] Manage **one client per server**; surface server identity to users.  
- [ ] Render UIs for **tool calls** (review/approval), **resources** (pickers/previews), **prompts** (command palette / slash commands).  
- [ ] Handle **roots** and keep them up‑to‑date.  
- [ ] Implement **SSE** support for Streamable HTTP; recover from disconnects.  
- [ ] Respect **list_changed** notifications (refresh catalogs).  
- [ ] Provide **human‑in‑the‑loop** controls for tools & sampling.  
- [ ] Log, trace, and expose errors clearly.

---

## 11) Minimal example payloads

> These are deliberately small and “shape‑focused” for quick copy/paste testing.

**Initialize**
```json
{ "jsonrpc":"2.0","id":1,"method":"initialize",
  "params":{
    "protocolVersion":"2025-06-18",
    "capabilities":{"tools":{},"resources":{},"prompts":{},"roots":{}},
    "clientInfo":{"name":"demo","version":"0.1.0"}
}}
```

**List tools**
```json
{ "jsonrpc":"2.0","id":2,"method":"tools/list" }
```

**Call a tool**
```json
{ "jsonrpc":"2.0","id":3,"method":"tools/call",
  "params":{"name":"say_hello","arguments":{"name":"Ada"}}}
```

**List resources**
```json
{ "jsonrpc":"2.0","id":4,"method":"resources/list","params":{"cursor":null} }
```

**Read a resource**
```json
{ "jsonrpc":"2.0","id":5,"method":"resources/read","params":{"uri":"file:///README.md"} }
```

**List prompts**
```json
{ "jsonrpc":"2.0","id":6,"method":"prompts/list" }
```

**Get a prompt**
```json
{ "jsonrpc":"2.0","id":7,"method":"prompts/get",
  "params":{"name":"code_review","arguments":{"code":"print('hi')"}}}
```

**Notifications**
```json
{ "jsonrpc":"2.0","method":"notifications/tools/list_changed" }
```

---

## 12) Transport snippets

**stdio (server loop pseudocode)**
```ts
// read newline-delimited JSON from stdin, write JSON to stdout
for await (const line of readLines(process.stdin)) {
  const msg = JSON.parse(line);
  handleMessage(msg, (out) => process.stdout.write(JSON.stringify(out) + "\n"));
}
```

**Streamable HTTP (server outline)**
- **POST /mcp**: accept one JSON‑RPC message per request; if it’s a request, you may respond with **JSON** or open an **SSE** stream to send multiple messages (then the final JSON‑RPC response).  
- **GET /mcp**: optional; open an SSE stream for unsolicited server→client messages (e.g., updates).

**Client POST requirements (essentials)**
- Always send `Accept: application/json, text/event-stream`.  
- Treat disconnects as transient; **cancellation** is an explicit protocol action.  
- Support **resumable** streams if the server offers them.

---

## 13) Security & trust notes (pragmatic defaults)

- **Human approval** for any destructive tool.  
- **Principle of least privilege**: scope tokens, narrow roots, short TTLs.  
- **Defensive transports**: validate `Origin`; don’t bind to `0.0.0.0` locally; require auth for HTTP.  
- **Data handling**: treat elicitation inputs as PII‑adjacent; don’t collect secrets; log minimally.  
- **Supply chain**: vet third‑party servers; prefer signed/verified sources; review code before granting broad scopes.

---

## 14) Useful tooling & ecosystem

- **Official SDKs:** TS, Python, Go, Kotlin, Swift, Java, C#, Ruby, Rust, PHP.  
- **MCP Inspector:** `npx @modelcontextprotocol/inspector …` to connect to local/remote servers, explore tools/resources/prompts, and watch notifications.  
- **“Connect to …” guides:** quick tutorials for local and remote servers using popular hosts.

---

## 15) Appendix — content block types (quick peek)

Most responses carry a `content: []` array with blocks such as:

```jsonc
{ "type":"text", "text":"..." }
{ "type":"image", "data":"<base64>", "mimeType":"image/png" }
{ "type":"audio", "data":"<base64>", "mimeType":"audio/wav" }
{ "type":"resource", "resource": { "uri":"...", "mimeType":"text/plain", "text":"..." } }
```

Use **annotations** (e.g., `audience`, `priority`) to hint how hosts should present/route content.

---

## 16) FAQ‑style guidance

- **How do I stream results?** Use the HTTP transport with SSE; send interim messages then the final JSON‑RPC response.  
- **Do I need my own LLM API key in the server?** Not if you use **Sampling** — the host will call the LLM.  
- **How do I scope filesystem access?** Respect **Roots** and ask the host for updates; never assume you can read anything else.  
- **What changes most often?** Tool & resource catalogs, roots, auth scopes — use **notifications** and re‑list on change.  
- **How do I debug?** Start with **MCP Inspector**; watch messages, try calls, verify schemas.

---

### That’s it.

If you know JSON‑RPC and HTTP, MCP should feel familiar. Start with one Tool or one Resource, wire up init + list + get/call, and iterate from there.
