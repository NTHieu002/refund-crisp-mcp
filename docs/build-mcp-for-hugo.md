# Building an MCP Server for Crisp's Hugo AI Agent

End-to-end guide for building a custom MCP (Model Context Protocol) server that Hugo can call from a Crisp conversation. Written from the lessons of `refund-crisp-mcp` — use it as the reference implementation.

---

## 1. What Hugo + MCP actually is

### The wire picture

```
Customer message (Crisp chat)
          │
          ▼
   Crisp conversation
          │
          ▼
   Hugo AI (LLM + tool loop)
          │  1. tools/list      — fetch tool catalog
          │  2. tools/call name — call the right tool(s)
          ▼
   Your MCP server (HTTPS endpoint)
          │
          ▼
   Return structured JSON
          │
          ▼
   Hugo composes a reply
          │
          ▼
   Customer sees the message
```

**Key ideas:**

- **MCP is an HTTP endpoint speaking JSON-RPC 2.0.** Your server exposes tools; Hugo discovers and calls them.
- **Hugo chooses which tool to call using the tool's description.** The LLM reads the description + input schema and reasons: "this message looks like a refund request, I should call `check_subscription` first". So descriptions are the single biggest quality lever.
- **MCP tools are stateless by design.** State persists in your DB if you add one; the MCP layer itself replays the full conversation every turn.
- **Hugo is multimodal.** Images/PDFs attached by the customer are read by Hugo directly. Your MCP server only sees the text/structured data Hugo chooses to pass in.

### Why MCP over a plain REST API

| REST API | MCP |
|----------|-----|
| Hugo needs a custom adapter per API | Standard JSON-RPC discovery (`tools/list`) |
| Hugo doesn't know when to call which endpoint | Each tool self-describes when to call it |
| Hardcoded in Hugo prompt | Add/remove tools on the server side, Hugo picks up via `tools/list` |

---

## 2. Prerequisites

- Node.js `24.x`
- A Crisp workspace on **Essentials** or **Plus** plan (AI Agent + MCP feature-gated)
- Basic TypeScript
- (Optional) Turso / Postgres / SQLite if you need cross-conversation state

---

## 3. Project scaffold

Minimum viable server:

```sh
mkdir my-mcp && cd my-mcp
npm init -y
npm install @modelcontextprotocol/sdk express zod
npm install -D typescript tsx tsc-alias @types/node @types/express
npx tsc --init
```

`package.json` scripts:

```json
{
  "type": "module",
  "scripts": {
    "dev":   "tsx watch --env-file-if-exists=.env src/server.ts",
    "build": "tsc --build tsconfig.json && tsc-alias -p tsconfig.json",
    "start": "node --env-file-if-exists=.env dist/src/server.js"
  },
  "engines": { "node": "24.x" }
}
```

`tsconfig.json` (essentials):

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "rootDir": ".",
    "outDir": "./dist",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

### Minimal `src/server.ts`

```ts
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp/index.js";

const app = express();
app.use(express.json());

const server = createMcpServer();

app.get("/health", (_req, res) => res.send("OK"));

app.post("/mcp", (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator : undefined,
    enableJsonResponse : true,
  });

  res.on("close", () => transport.close());

  server.connect(transport)
    .then(() => transport.handleRequest(req, res, req.body))
    .catch((error) => {
      console.error(error);
      if (!res.headersSent) res.status(500).json({ error: "MCP request failed" });
    });
});

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
app.listen(port, () => console.log(`MCP on http://localhost:${port}/mcp`));
```

### Minimal `src/mcp/index.ts`

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "my-mcp", version: "1.0.0" },
    {
      instructions: `
        Describe what this server is for, when Hugo should call its tools,
        and any conventions (order, chaining) to follow.
      `,
    },
  );

  // registerMyTool(server);  ← add each tool here

  return server;
}
```

---

## 4. Designing tools for Hugo

This is where most of the quality comes from. A badly named tool with a vague description will be ignored or misused by the LLM.

### 4.1 Naming

- `snake_case`
- Start with a verb: `get_user`, `calculate_refund`, `classify_case`, `save_state`
- Avoid generic names: `process`, `handle`, `do_stuff`
- Be specific: `check_subscription` is better than `lookup`

### 4.2 Descriptions are the product

The description is read by Hugo's LLM to decide whether to call the tool on a given turn. Treat it as a mini system prompt.

Template:

```
Use this tool to <what it does>.

Common use-cases include:
- <concrete scenario 1>
- <concrete scenario 2>
- <concrete scenario 3>

<When it fits in the conversation flow / what other tools to chain before or after.>
```

Real example (`refund-crisp-mcp`):

```ts
description: `
  Use this tool to classify a refund request into one of the 7 playbook cases
  (TH1 to TH7) and get back the recommended action, deduction and escalation
  flags.

  Common use-cases include:
  - Deciding whether to apply 0%, 20% or 40% deduction
  - Knowing whether the agent can self-decide or must escalate to Manager
  - Learning whether the store must first downgrade to Free and whether the
    bill must be Paid before the refund can be issued

  Call this tool once enough context is known, usually after
  "check_subscription" and "get_billing_history".
`,
```

Notes:
- Says *what* + *when* + *chain with what*
- References other tool names so Hugo learns the workflow

### 4.3 Input schema (Zod)

Always attach `.describe()` to every field. Hugo reads these too.

```ts
const INPUT_SHAPE = {
  store_url : z.string().describe("Shopify store URL (e.g. mystore.myshopify.com)"),
  reason    : z.string().describe("Customer's stated reason in their own words"),
  is_angry  : z.boolean().describe("True if the customer threatens a bad review or escalation"),
  num_cycles_requested : z.number().int().min(1)
    .describe("Number of billing cycles the customer wants refunded"),
} satisfies ZodRawShape;
```

Use `z.enum([...])` for controlled values — Hugo will respect them:

```ts
bill_status : z.enum(["paid", "upcoming", "failed"])
  .describe("Status of the bill the customer is asking a refund for"),
```

### 4.4 Output schema

Explicit, structured output is way better than free text. Hugo can reason directly on fields.

```ts
const OUTPUT_SHAPE = {
  found        : z.boolean().describe("Whether a match was found"),
  subscription : z.object(SUBSCRIPTION_SHAPE).nullable().describe("Match details"),
  error        : z.string().nullable().describe("Error message, null on success"),
} satisfies ZodRawShape;
```

Patterns:
- **Always include `error: string | null`** — lets Hugo show a friendly error without throwing
- **Use `found: boolean`** for lookups — clearer than just returning `null`
- **Return enough for Hugo to chain** — e.g. `current_cycle_start` so `calculate_refund` has what it needs

### 4.5 File structure per tool

Split each tool into three files (keeps handlers testable and schemas tidy):

```
src/mcp/tools/
  my_tool/
    shapes.ts    ← Zod input / output
    handler.ts   ← pure business logic (async function)
    main.ts      ← registers tool on the MCP server
```

`main.ts`:

```ts
import { myToolHandler } from "./handler.js";
import { MY_TOOL_INPUT_SHAPE, MY_TOOL_OUTPUT_SHAPE } from "./shapes.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerMyTool(server: McpServer): void {
  server.registerTool(
    "my_tool",
    {
      title        : "Human-friendly title",
      description  : `...`,
      inputSchema  : MY_TOOL_INPUT_SHAPE,
      outputSchema : MY_TOOL_OUTPUT_SHAPE,
    },
    async (input) => {
      const output = await myToolHandler(input);
      return {
        content : [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent : output,
      };
    },
  );
}
```

Both `content` (text) and `structuredContent` (typed) are returned — Hugo prefers structured, falls back to text.

---

## 5. State persistence (if you need it)

Without DB: each Hugo turn calls the MCP fresh. State is reconstructed from the conversation history — works for many use cases.

Use a DB when you need:
- Resume a case days later without re-asking the customer what's been done
- Share state across Hugo conversations / across agents
- Audit trail beyond what Crisp stores
- Pipeline views ("all cases awaiting manager approval")

### Recommended: Turso / libSQL

- Free tier: 9 GB, 25 M writes/month, 500 databases
- SQLite syntax — trivial local dev
- No cold start, global replication
- Serverless HTTP API (no connection pool to manage)

### Minimal DB tool pair

```
src/db/
  client.ts    ← libSQL client singleton
  schema.ts    ← embedded CREATE TABLE + indexes
  migrate.ts   ← runs schema on boot (idempotent)
src/mcp/tools/
  get_case_state/
  save_case_state/
  list_pending_cases/
```

Run migrations at server start so every deploy self-heals:

```ts
runMigrations().then(() => app.listen(port, ...));
```

### Schema principles

- Primary key = stable customer-facing identifier (e.g. `store_url`, `email`, `order_id`)
- All fields optional — tools do **partial upsert** so each tool call only writes the fields it owns
- Include `crisp_conversation_id` for back-linking into Crisp
- Include `stage` (enum) — Hugo branches on it: "already in `awaiting_manager`? → don't restart"
- Include `created_at` + `updated_at` — audit + list ordering

### Partial upsert pattern

```ts
await client.execute({
  sql :
    `INSERT INTO cases (${cols}) VALUES (${placeholders}) ` +
    `ON CONFLICT(store_url) DO UPDATE SET ${cols.map(c => `${c}=excluded.${c}`).join(", ")}, ` +
    `updated_at = CURRENT_TIMESTAMP`,
  args : [pk, ...values],
});
```

---

## 6. Testing locally

### MCP Inspector

```sh
npm install -D @modelcontextprotocol/inspector
npx @modelcontextprotocol/inspector
```

Browser opens → Transport: **Streamable HTTP** → URL `http://localhost:3000/mcp` → **Connect**. All tools appear on the left; click to run.

### curl smoke test

```sh
# List tools
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call a tool
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"check_subscription","arguments":{"store_url":"foo.myshopify.com"}}}'
```

### Node smoke test for DB handlers

Write a quick standalone script to call handler functions directly (skip the HTTP/MCP layer):

```sh
node --env-file=.env -e "
import('./dist/src/mcp/tools/save_case_state/handler.js').then(async ({saveCaseStateHandler}) => {
  const r = await saveCaseStateHandler({store_url: 'test.myshopify.com', stage: 'collecting_info'});
  console.log(r);
  process.exit(0);
});"
```

---

## 7. Exposing the server to Crisp

Hugo runs in Crisp's cloud → it needs a **public HTTPS URL**. Three common setups:

### Option A — Cloudflare Tunnel (dev / demo)

```sh
npm run dev                       # terminal 1
cloudflared tunnel --url http://localhost:3000   # terminal 2
```

Cloudflared prints a temporary `https://<random>.trycloudflare.com` URL. Good for testing; URL changes on every restart.

### Option B — Fly.io (production, managed)

Add `fly.toml` + `Dockerfile` (generate via `npx @flydotio/dockerfile`), then:

```sh
fly apps create my-mcp
fly secrets set TURSO_DATABASE_URL="..." TURSO_AUTH_TOKEN="..."
fly deploy
```

Your MCP is live at `https://my-mcp.fly.dev/mcp`. Scale-to-zero means near-zero idle cost.

### Option C — VPS + nginx (production, your infra) ← what refund-mcp uses

> This is how **this** project is actually deployed: VPS `pf-support`, PM2
> process `refund-mcp` in `/var/www/mcp-refund`, behind nginx. See
> [`add-another-mcp.md`](add-another-mcp.md) for the full runbook.

1. Install Node, PM2, nginx
2. Clone repo, create `.env`, `pm2 start npm --name my-mcp -- run start`
3. nginx reverse-proxies the subdomain; HTTPS is handled either by Let's Encrypt via `certbot --nginx` or by an upstream edge.

Plain HTTP (when an edge/load balancer already terminates HTTPS — common at companies):

```nginx
# /etc/nginx/sites-available/my-mcp.conf
server {
    listen 80;
    server_name my-mcp.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_buffering   off;
        proxy_read_timeout 1h;
    }
}
```

Enable + reload:

```sh
ln -s /etc/nginx/sites-available/my-mcp.conf /etc/nginx/sites-enabled/my-mcp.conf
nginx -t && systemctl reload nginx
```

See `docs/add-another-mcp.md` for multi-MCP routing on the same VPS.

---

## 8. Connecting to Crisp

1. [app.crisp.chat](https://app.crisp.chat/) → **AI Agent → Automate → Integrations & MCP → External MCP servers**
2. **Add MCP server**
3. URL: `https://<your-host>/mcp`
4. Name the server
5. **Refresh tools from server** — every tool should show up with its description + input schema
6. Enable the toggle → **Save changes**

### Tool-level user verification (optional)

On sensitive tools you can require the customer to verify via email/SMS OTP before Hugo is allowed to call it:

**Manage** → toggle **Require user identification verification** per tool.

### Authentication (optional but recommended in prod)

Crisp supports adding `Authorization: Bearer <token>` or Basic Auth on requests. Add middleware in `server.ts`:

```ts
app.post("/mcp", (req, res, next) => {
  const auth = req.header("authorization");
  if (auth !== `Bearer ${process.env.MCP_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}, /* existing handler */);
```

---

## 9. Tuning Hugo's system prompt

The MCP server exposes capabilities; the Hugo **system prompt** inside Crisp decides how to use them. Whenever you add state tools, you almost always need to update the prompt.

Example prompt additions:

```
Whenever a customer asks about refunds, first call `get_case_state` with the
store URL to check if a case already exists. If `winback_offered` is true,
skip the win-back and go straight to verification.

After every meaningful step (classification, calculation, breakdown sent),
call `save_case_state` with the progress so the conversation can be resumed
later.

Never send a refund amount when `num_cycles_requested` >= 3 without first
getting Manager approval — set `stage: "awaiting_manager"` and wait.

Follow up at most twice if the customer stops replying — track with
`followup_count`.
```

Iterate: watch Playground transcripts, find cases Hugo does wrong, add a rule.

---

## 10. Testing in Crisp Playground

**AI Agent → Automate → Playground** → open or start a conversation → chat normally.

The right-hand panel shows every tool call: name, input, output. Use it to debug:

- **Hugo doesn't call your tool** → description too vague → sharpen it
- **Hugo calls with wrong args** → input descriptions unclear → add examples + constraints
- **Hugo ignores the output** → structured output not surfacing → check you're returning `structuredContent`
- **Hugo repeats work every turn** → add a state tool and make the prompt enforce check-first

---

## 11. Idempotency + error handling

MCP tools can be called multiple times on the same input (Hugo retries, users resend messages). Design for it:

- **Lookups**: always return the same shape for the same input
- **Writes**: use `INSERT ... ON CONFLICT DO UPDATE` (upsert) — never assume the row doesn't exist
- **Side effects** (sending email, charging a card): require an **idempotency key** parameter, dedupe on it
- **Errors**: catch inside the handler, return `{ success: false, error: "..." }`. Don't throw — throwing returns an unstructured MCP error that Hugo handles poorly

Pattern:

```ts
async function myToolHandler(input) {
  try {
    const result = await doWork(input);
    return { success: true, data: result, error: null };
  } catch (error) {
    return { success: false, data: null, error: error instanceof Error ? error.message : String(error) };
  }
}
```

---

## 12. Production checklist

- [ ] HTTPS endpoint with a valid cert
- [ ] `/health` endpoint returning `200 OK` for monitoring
- [ ] Environment variables via `.env` (dev) and secrets manager (prod) — never commit secrets
- [ ] Migrations run at startup (idempotent)
- [ ] Logs go to stdout/stderr so the process manager captures them (`pm2 logs`, `fly logs`)
- [ ] Process manager auto-restarts on crash (PM2, systemd, Fly machine)
- [ ] Uptime monitor (UptimeRobot, Better Stack) hitting `/health` every 5 min
- [ ] Optional: `Authorization` header on `/mcp` to restrict to Crisp
- [ ] Optional: rate limiting if the endpoint is publicly guessable

---

## 13. Reference: `refund-crisp-mcp`

Full working example with 9 tools in 3 layers (lookup / logic / state), Turso state, Fly + VPS deployment. Patterns to copy:

| Concern | File |
|---------|------|
| Server entrypoint | [`src/server.ts`](../src/server.ts) |
| MCP init + instructions | [`src/mcp/index.ts`](../src/mcp/index.ts) |
| Tool registration hub | [`src/mcp/tools/index.ts`](../src/mcp/tools/index.ts) |
| Tool (simple lookup) | [`src/mcp/tools/check_subscription`](../src/mcp/tools/check_subscription) |
| Tool (rule engine) | [`src/mcp/tools/classify_refund_case`](../src/mcp/tools/classify_refund_case) |
| Tool (pure math) | [`src/mcp/tools/calculate_refund`](../src/mcp/tools/calculate_refund) |
| Tool (state write) | [`src/mcp/tools/save_case_state`](../src/mcp/tools/save_case_state) |
| DB schema | [`src/db/schema.ts`](../src/db/schema.ts) |
| DB queries (upsert, list) | [`src/db/cases.ts`](../src/db/cases.ts) |
| Deploy scripts | [`scripts/setup.sh`](../scripts/setup.sh) |
| Deploy runbook | [`docs/add-another-mcp.md`](add-another-mcp.md) |

---

## 14. Common pitfalls

1. **Generic tool descriptions** — Hugo guesses wrong. Always include concrete scenarios and what to chain.
2. **Mutable state inside tools** — makes retries / resumes messy. Keep tools pure; persist separately.
3. **Throwing from handlers** — return `{ error: "..." }` instead so Hugo can surface it.
4. **Forgetting `structuredContent`** — Hugo falls back to raw text, loses type info.
5. **Storing binaries in the MCP** — send image URL or let Hugo handle it multimodally; keep MCP text/JSON only.
6. **Not testing in Playground** — unit tests prove code works, Playground proves Hugo uses it correctly. Ship neither alone.
7. **Secrets in the repo** — use `.env` + secrets manager; commit only `.env.example`.
8. **Skipping idempotency** — customer resends a message → duplicate email sent → angry customer.

---

## 15. Further reading

- Crisp MCP docs: https://help.crisp.chat/en/article/how-to-build-mcp-integrations-with-hugo-tlrqmn/
- MCP spec: https://github.com/modelcontextprotocol/specification
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Anthropic MCP course: https://anthropic.skilljar.com/introduction-to-model-context-protocol
