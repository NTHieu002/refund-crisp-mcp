# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An MCP (streamable HTTP) server that gives Crisp's **Hugo AI Agent** the tools to run a PageFly refund conversation end-to-end: look up subscription/billing, classify the case against the PageFly playbook (TH1–TH7), compute a prorated/multi-cycle refund, draft the reply, and persist case state across conversations. Hugo is the LLM caller — this server is pure tooling, no LLM of its own.

## Commands

```sh
npm run dev      # tsx watch, auto-reload, loads .env — server on http://localhost:3000/mcp
npm run build    # tsc --build THEN tsc-alias (rewrites @/… aliases in emitted dist/ JS)
npm run start    # run compiled dist/src/server.js
npm run lint     # eslint on src/**/*.{ts,js}
npm run inspect  # MCP Inspector UI — connect via Streamable HTTP to http://localhost:3000/mcp
npm run tunnel   # cloudflared tunnel so Crisp's cloud can reach localhost (URL changes each run)
```

There is **no test runner** — `npm test` intentionally errors. `scripts/test-crisp.mjs` is a manual probe, not a suite. Verify changes via `npm run inspect` or by curling `/mcp`.

Node 24.x is required (`engines`). Build always needs the `tsc-alias` step — running raw `tsc` output will fail at runtime because `@/…` path aliases won't resolve.

## Architecture

**Request path:** `src/server.ts` (Express) → `/mcp` POST creates a fresh `StreamableHTTPServerTransport` per request (stateless, `sessionIdGenerator: undefined`) → `createMcpServer()` (`src/mcp/index.ts`) → tools registered in `src/mcp/tools/index.ts`. DB migrations run once on boot before `listen()`.

**The server `instructions` string in `src/mcp/index.ts` is load-bearing.** It encodes the flow order and the two HARD GATES Hugo must obey (never quote a refund before `collect_refund_info` returns `ready_to_process: true`; tag the conversation on turn 1). When you change tool behavior or the playbook, update these instructions to match — they are the only thing steering the upstream agent.

**Tool triad convention.** Every tool is a directory under `src/mcp/tools/<name>/` with exactly three files:
- `shapes.ts` — Zod input/output schemas + exported TS types (`...Input`, `...Output`)
- `handler.ts` — pure business logic, takes Input returns Output (or Promise)
- `main.ts` — `register<Name>Tool(server)` wiring schema → handler, returns both `content` (JSON string) and `structuredContent`

Add a tool by creating this triad and registering it in `src/mcp/tools/index.ts`. Tools group into four tiers there: lookup (fixtures/Partner API), pure-logic, state (Turso), Crisp side-effects.

**Tool descriptions are prompt engineering, not docs.** The long `description` strings (and Zod `.describe()` text, e.g. the `crisp_session_id` regex message in `tag_case/shapes.ts`) exist to correct specific Hugo failure modes — hallucinated session IDs, escalating on first lookup miss, skipping the info-collection gate. Treat their wording as deliberate; don't trim them as "verbose."

**Defense in depth — handlers re-enforce the gates the prompt asks for.** `calculate_refund/handler.ts` returns a `BLOCKED` result if `has_billing_invoice` / `has_bank_confirmation` / `verified_downgrade_complete` aren't set, because tool descriptions alone are routinely ignored. Keep critical preconditions enforced in the handler, not just described.

## Data sources & resolution

`check_subscription` + `get_billing_history` read from the **Shopify Partner API proxied through an n8n webhook** (`src/shopify/partner.ts`, `N8N_WEBHOOK_URL`/`N8N_API_KEY`). When those env vars are unset (dev/offline), handlers fall back to `fixtures/*.ts`. Partner responses are TTL-cached 60s so a back-to-back subscription+billing pair shares one webhook call.

**Store URL is always normalized before any lookup.** Customers send every shape imaginable. `src/utils/store_url.ts` (`normalizeStoreUrl`) handles admin URLs, bare handles, and canonical `<handle>.myshopify.com` synchronously. `src/utils/store_resolver.ts` (`resolveStoreUrl`) wraps it and, for custom domains, does a best-effort 3s storefront fetch scraping `Shopify.shop = "..."` from HTML (cached 3 days). A miss returns a customer-facing error string telling them where to find their `.myshopify.com` URL — by design, do NOT escalate to a human on the first miss.

## Case state model

One denormalized SQLite/libSQL table, `cases`, **keyed by `store_url`** (the natural conversation key — a returning customer is matched by store, not session). Schema lives embedded as a TS string in `src/db/schema.ts` (`SCHEMA_SQL`, statements separated by `;;`) so `tsc` emits it without copying raw `.sql` files. `src/db/migrate.ts` splits on `;;` and runs each statement; everything is `IF NOT EXISTS`, idempotent, safe on every boot.

`src/db/cases.ts` is the only DB access layer: `upsertCase` does a partial merge (`ON CONFLICT … DO UPDATE SET … = excluded.…`, skipping `undefined` fields), so `save_case_state` can persist any subset of the ~60 columns. The `CaseColumn` union there is the source of truth for column names — keep it, the `CREATE TABLE`, and `save_case_state/shapes.ts` in sync when adding fields. Booleans are stored as `INTEGER` 0/1 (`toInt` in the save handler).

**`save_case_state` has two fire-and-forget side effects** after a successful write: it auto-tags the Crisp conversation with the `refund` segment (`src/crisp/client.ts`) and POSTs a snapshot to the ops-log webhook (`src/log/client.ts`, `N8N_LOG_WEBHOOK_URL`). Both swallow their own errors — a Crisp/log outage must never fail the DB save. This is the safety net behind the turn-1 tagging gate.

## Playbook rules (encoded in handlers)

`classify_refund_case/handler.ts` maps context to TH1–TH7 by **priority order** (TH5 unauthorized auto-upgrade wins over everything → TH4 upcoming bill → TH7 closed store → TH3 uninstalled → TH2 double-charge → TH6 stop-charges → TH1 default cancel/downgrade). Deduction: 0% when a team commitment exists or TH2, 40% for 3+ cycles, else 20%. Auto-escalate to Manager (Boo) when `num_cycles ≥ 3`, TH5, or a prior commitment; to Shift Manager when the customer is angry.

`calculate_refund/handler.ts`: single cycle = `charge × days_unused/30`; multi-cycle = `charge × cycles` (full cycles, no proration); then subtract the deduction %. Cycle length is always 30 days.

## Environment & deploy

Env vars (`.env.example` is current): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `PORT`; `CRISP_WEBSITE_ID`/`CRISP_IDENTIFIER`/`CRISP_KEY` (for tagging); `N8N_WEBHOOK_URL`/`N8N_API_KEY` (Partner lookup, fixtures fallback when unset); `N8N_LOG_WEBHOOK_URL` (ops sheet, skipped when unset).

**Production is a VPS, not Fly.io.** It runs as PM2 process `refund-mcp` in `/var/www/mcp-refund` on port 3000, behind nginx (`refund-mcp.pagefly.io`). Deploy = SSH in, `cd /var/www/mcp-refund && git pull && npm ci && npm run build && pm2 reload refund-mcp` (use `pm2 restart` if `.env` changed). Creds live in the VPS `.env` (chmod 600), never committed. Full runbook: `docs/add-another-mcp.md`.

## Style

Files use a banner-comment layout (`IMPORTS` / `HANDLER` / `EXPORTS` blocks) and aligned-colon object literals — match it. ESM throughout: **relative imports must carry the `.js` extension** even from `.ts` source (`@/db/client.js`), because the emitted code is ESM. Path aliases `@/*` → `src/*` and `@fixtures/*` → `fixtures/*`.
