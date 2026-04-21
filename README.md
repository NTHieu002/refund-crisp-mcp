# PageFly Refund MCP Server

MCP (Model Context Protocol) server for Crisp's **Hugo AI Agent** to handle PageFly refund requests end-to-end — from first customer message to Manager escalation and post-refund checklist.

Built with the [@modelcontextprotocol TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), Express, Zod, and Turso (libSQL) for persistent case state.

---

## What it does

Hugo reads the customer message, picks the right tools, and drives the refund conversation through the PageFly playbook: collect info → classify case → compute prorated refund → draft reply → persist state for later resumption.

If the customer disappears and comes back a day later, Hugo calls `get_case_state` first and continues exactly where it left off (win-back already offered, manager pending, bill still Upcoming, etc.).

---

## Tools (10 total)

### Lookup — mock data today, swap for real API in production
- **`check_subscription`** — subscription status, plan, price, cycle window (input: `store_url` or `email`)
- **`get_billing_history`** — every paid/upcoming/failed bill with Shopify fee-adjusted earnings

### Pure logic — deterministic rules & math
- **`classify_refund_case`** — maps context to one of the 7 playbook cases (TH1–TH7), picks the deduction (0/20/40 %) and flags escalation to Manager (Boo) or Shift Manager
- **`calculate_refund`** — 30-day prorated refund or multi-cycle full-cycle refund, with deduction applied
- **`collect_refund_info`** — decides the next question to ask (store URL, invoice, reason, bank confirmation) and surfaces blockers (Upcoming bill, plan still Paid)
- **`generate_refund_message`** — drafts the customer-facing reply by combining the PageFly templates (intro, win-back, breakdown, Upcoming-bill options, case-specific blocks)

### State — backed by Turso libSQL
- **`get_case_state`** — load a case by `store_url`
- **`save_case_state`** — partial upsert (all 50+ fields optional, merges with existing row)
- **`list_pending_cases`** — review cases by stage (e.g. `awaiting_manager`, `awaiting_customer_confirm`)

### Crisp side-effects — write back into the Crisp conversation
- **`tag_case`** — attach a status segment (`refund-done`, `refund-awaiting-manager`, `escalated`, …) to the Crisp conversation via the REST API

---

## Project structure

```
src/
  server.ts                       # Express entrypoint, runs migrations on boot
  mcp/
    index.ts                      # McpServer setup + instructions for Hugo
    tools/
      check_subscription/         # Each tool = main.ts + handler.ts + shapes.ts
      get_billing_history/
      classify_refund_case/
      calculate_refund/
      collect_refund_info/
      generate_refund_message/
      get_case_state/
      save_case_state/
      list_pending_cases/
      _shared/case_shape.ts       # Shared Zod shape for DB-backed case rows
      index.ts                    # Registers all 9 tools
  db/
    client.ts                     # libSQL client singleton
    schema.ts                     # Embedded CREATE TABLE + indexes
    migrate.ts                    # Idempotent migration runner
    cases.ts                      # upsertCase / getCase / listCasesByStage
  utils/logger.ts                 # MCP request/response logger
fixtures/
  stores.ts                       # Mock subscriptions — replace with real API in prod
  billing_cycles.ts               # Mock billing history — replace with real API in prod
Dockerfile                        # Generated via @flydotio/dockerfile
fly.toml                          # Region nrt, scale-to-zero, /health check
```

---

## Environment

Copy `.env.example` to `.env` and fill in your Turso credentials:

```env
TURSO_DATABASE_URL=libsql://<your-db>.turso.io
TURSO_AUTH_TOKEN=<token>
PORT=3000

# Crisp plugin — required by tag_case (and any future write-back tools)
CRISP_WEBSITE_ID=<website-uuid>
CRISP_IDENTIFIER=<plugin-identifier>
CRISP_KEY=<plugin-key>
```

**No Turso account yet?** Sign up at [turso.tech](https://turso.tech), `turso db create refund-case`, `turso db tokens create refund-case --expiration none`.

Migrations run automatically on server start — safe to re-run anytime.

---

## Local development

Prereqs: Node.js 24.x.

```sh
npm ci
npm run dev
```

Server listens on `http://localhost:3000/mcp`. Test endpoints:

```sh
curl http://localhost:3000/           # welcome message
curl http://localhost:3000/health     # OK
```

### Inspecting tools

```sh
npm run inspect
```

Opens the MCP Inspector in your browser. Set **Transport Type → Streamable HTTP**, URL `http://localhost:3000/mcp`, click **Connect** — all 9 tools appear in the left panel.

### Exposing locally to Crisp

Hugo lives in Crisp's cloud and can't reach `localhost`. Open a second terminal:

```sh
npm run tunnel
```

Cloudflared prints a temporary `https://<random>.trycloudflare.com` URL — this changes every restart.

---

## Connecting to Crisp

1. [app.crisp.chat](https://app.crisp.chat/) → **AI Agent → Automate → Integrations & MCP → External MCP servers**
2. **Add MCP server** → paste `https://<your-url>/mcp`
3. Name it, click **Refresh tools from server** (should list all 9), enable the toggle, **Save changes**
4. Test in **AI Agent → Automate → Playground**

### Example test conversation

> Hi, I'm Hieu from `hieu-first-store.myshopify.com`. I'd like to cancel and get a refund please.

Expected chain:
1. `get_case_state` — no case yet
2. `check_subscription` → 5-slot $24, active, 10 days into cycle
3. `get_billing_history` → 3 paid cycles
4. `collect_refund_info` — asks for reason + invoice + bank
5. After customer replies → `classify_refund_case` → **TH1**, deduction 20 %
6. `calculate_refund(24, days_used=10, days_unused=20, 20%)` → **$12.80**
7. `generate_refund_message` → drafts the breakdown
8. `save_case_state(stage: "awaiting_customer_confirm", refund_amount: 12.80, crisp_conversation_id: "session_...")`

Verify the row was saved:

```sh
node --env-file=.env -e "
import('./dist/src/db/client.js').then(async ({getDbClient}) => {
  const r = await getDbClient().execute('SELECT store_url, stage, case_type, refund_amount FROM cases');
  console.log(JSON.stringify(r.rows, null, 2));
  process.exit(0);
});
"
```

---

## Deploying to Fly.io

The repo ships with `fly.toml` (region `nrt` — same as the Turso DB, scale-to-zero, `/health` check) and a Docker image ready to go.

Install flyctl if needed:

```powershell
iwr https://fly.io/install.ps1 -useb | iex    # Windows
```

```sh
fly auth login

# First time only (app name is globally unique — update fly.toml if you change it)
fly apps create refund-crisp-mcp

# Inject Turso credentials as Fly secrets (never commit them)
fly secrets set \
  TURSO_DATABASE_URL="libsql://<your-db>.turso.io" \
  TURSO_AUTH_TOKEN="<token>"

fly deploy
```

Your MCP endpoint becomes `https://refund-crisp-mcp.fly.dev/mcp`. Update the URL in Crisp.

Runtime checks:

```sh
fly logs
curl https://refund-crisp-mcp.fly.dev/health   # OK
```

---

## Moving from mock to production data

`check_subscription` and `get_billing_history` currently read from `fixtures/*.ts`. To wire real data, replace the body of their `handler.ts` files with `fetch(...)` against either:

- **PageFly internal API** — richest data (plan name, slots, earnings, cancel reason). Ask the backend team.
- **Shopify Partner GraphQL API** — subscription + transactions. Limited to what's exposed to partners.

Zod input/output shapes stay the same, so **no other tool needs changes** — the six logic and state tools keep working unchanged. Don't forget to add an API key to `.env` and Fly secrets.

---

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | tsx watch mode, auto-reload on code change, loads `.env` |
| `npm run build` | `tsc --build` + `tsc-alias` (resolves `@/…` paths in emitted JS) |
| `npm run start` | Run compiled `dist/` server, loads `.env` if present |
| `npm run tunnel` | Expose localhost via Cloudflare Tunnel |
| `npm run inspect` | Open the MCP Inspector UI |
| `npm run lint` | ESLint on `src/` |

---

## Operational notes

- **Cost**: Turso free tier covers 9 GB storage + 25 M writes/month — this server uses a fraction of it. Fly scale-to-zero keeps idle cost near $0.
- **Cold start**: first MCP request after idle takes ~1–2 s (Fly machine wake + libSQL TLS handshake). All subsequent calls < 100 ms.
- **State durability**: cases live in Turso, not on the Fly machine. Redeploying or scaling doesn't lose data.
- **Safety**: refunds of 3+ cycles, unauthorized auto-upgrades (TH5) and any case with a team-member commitment are auto-flagged for Manager (Boo) approval — Hugo won't send an amount without it.
