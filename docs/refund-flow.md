# Refund flow — architecture & sequence

End-to-end map of how a refund request travels from a Crisp customer through Hugo, the MCP server, the Shopify Partner API proxy, and back to the conversation as a confirmed refund. Useful for onboarding, debugging mid-flow stalls, and reviewing what happens on every side effect.

---

## Architecture overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CUSTOMER (Crisp chat)                       │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ message
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       CRISP HUGO (AI Agent)                          │
│  - reads conversation context                                        │
│  - decides which MCP tool to call next                               │
└──┬─────────────────────────────────────┬─────────────────────────────┘
   │ MCP /mcp call                       │ webhook (every message)
   ▼                                     ▼
┌──────────────────────────────┐   ┌──────────────────────────────────┐
│  refund-mcp.pagefly.io       │   │  n8n /webhook/crisp-sharetip-    │
│  (Express + MCP SDK)         │   │  tool — auto-tag refund          │
│                              │   │   ┌────────────────────────────┐ │
│  10 tools                    │   │   │ IF content matches refund  │ │
│  ├── check_subscription      │   │   │ keywords (refund/cancel/   │ │
│  ├── get_billing_history     │   │   │ unsubscribe/hoàn tiền/...) │ │
│  ├── classify_refund_case    │   │   └─────────────┬──────────────┘ │
│  ├── calculate_refund        │   │                 ▼                │
│  ├── collect_refund_info     │   │   GET segs → merge → PATCH       │
│  ├── generate_refund_message │   │   adds "refund" segment to       │
│  ├── get_case_state          │   │   conversation                   │
│  ├── save_case_state         │   └──────────────────┬───────────────┘
│  ├── list_pending_cases      │                      │
│  └── tag_case                │   ┌──────────────────▼──────────────┐
│                              │   │      Crisp REST API v1          │
│  Side effects:               │◄──┤  /website/.../conversation/.../ │
│  ├─ tag_case: PATCH segment, │   │  meta (segments)                │
│  │  POST log (early row)     │   └─────────────────────────────────┘
│  └─ save_case_state: Turso   │
│     upsert, PATCH, POST log  │
└──┬───────────┬────────┬──────┘
   │           │        │
   ▼           ▼        ▼
┌────────┐ ┌────────┐ ┌────────────────┐
│ Turso  │ │  n8n   │ │  n8n           │
│ libSQL │ │ partner│ │  refund-log    │
│  cases │ │ proxy  │ │  → Sheet       │
│ table  │ │ Shopify│ │  (when wired)  │
│        │ │ Partner│ │                │
└────────┘ │  API   │ └────────────────┘
           └────────┘
```

Two parallel paths every customer message takes:

- **MCP path** — Hugo invokes tools at `/mcp`. The MCP server normalizes the store URL, looks up subscription via the n8n Partner API proxy, applies playbook rules, drafts the reply, and persists state.
- **Webhook path** — Crisp sends every `message:received` to n8n. A keyword filter triggers a Crisp Segments PATCH that adds the `refund` tag, even if Hugo never calls `tag_case`. This is the safety net for the dashboard filter.

---

## Sequence — typical refund flow

```
Customer        Hugo               MCP                         Turso/Partner
   │              │                  │                              │
   │ "i need     │                  │                              │
   │  refund"    │                  │                              │
   ├──────────►  │                  │                              │
   │             │ get_case_state   │                              │
   │             ├────────────────► │ getCase(store_url)           │
   │             │                  ├────────────────────────────► │
   │             │                  │ ◄──── null (no store_url yet)│
   │             │ collect_refund_  │                              │
   │             │ info(empty)      │                              │
   │             ├────────────────► │                              │
   │             │ ◄── ask reason   │                              │
   │ "downgrade" │                  │                              │
   ├──────────►  │                  │                              │
   │             │ collect_refund_  │                              │
   │             │ info(reason=✓)   │                              │
   │             ├────────────────► │                              │
   │             │ ◄── ask store_url│                              │
   │             │     + image guide│                              │
   │ "abc.       │                  │                              │
   │  myshopify  │                  │                              │
   │  .com"      │                  │                              │
   ├──────────►  │                  │                              │
   │             │ check_           │ resolveStoreUrl(...)         │
   │             │ subscription     ├──┐                           │
   │             ├────────────────► │  │ normalize / fetch         │
   │             │                  │◄─┘                           │
   │             │                  │ fetchPartnerData → n8n       │
   │             │                  ├────────────────────────────► │
   │             │                  │ ◄── { plan: "5-slot", ... }  │
   │             │ ◄── subscription │                              │
   │             │ collect_refund_  │                              │
   │             │ info(store=✓)    │                              │
   │             ├────────────────► │                              │
   │             │ ◄── ask invoice  │                              │
   │ [PDF/png]   │                  │                              │
   ├──────────►  │                  │                              │
   │             │ collect_refund_  │                              │
   │             │ info(invoice=✓)  │                              │
   │             ├────────────────► │                              │
   │             │ ◄── ask bank     │                              │
   │ "PayPal"    │                  │                              │
   ├──────────►  │                  │                              │
   │             │ collect_refund_  │                              │
   │             │ info(bank=✓)     │                              │
   │             ├────────────────► │                              │
   │             │ ◄── ready_to_    │                              │
   │             │     process: true│                              │
   │             │                  │                              │
   │             │ classify_refund_ │                              │
   │             │ case(...)        │                              │
   │             ├────────────────► │                              │
   │             │ ◄── TH1, 20% ded │                              │
   │             │ calculate_refund │ ┌──────────────────────────┐ │
   │             │ (flags: invoice= │ │ HARD GATE                │ │
   │             │  ✓, bank=✓,      │ │ all 3 flags must be true │ │
   │             │  downgraded=?)   │ │ → BLOCKED if any false   │ │
   │             ├────────────────► │ └──────────────────────────┘ │
   │             │ ◄── refund: $X   │                              │
   │             │ generate_refund_ │                              │
   │             │ message(...)     │                              │
   │             ├────────────────► │                              │
   │             │ ◄── draft msg    │                              │
   │ ◄── draft   │                  │                              │
   │     reply   │                  │                              │
   │ "yes        │                  │                              │
   │  confirm"   │                  │                              │
   ├──────────►  │                  │                              │
   │             │ save_case_state  │ upsertCase(...)              │
   │             │ (stage=refund_   ├────────────────────────────► │
   │             │  issued)         │ ◄── saved row                │
   │             ├────────────────► │                              │
   │             │                  │ ┌──────────────────────────┐ │
   │             │                  │ │ side effects:            │ │
   │             │                  │ ├─► PATCH Crisp segments   │ │
   │             │                  │ ├─► POST log webhook       │ │
   │             │                  │ └──────────────────────────┘ │
   │             │ ◄── success      │                              │
   │ ◄── "refund │                  │                              │
   │     confirmed"                 │                              │
```

---

## State machine — case stages

```
            ┌─────────────────┐
            │ collecting_info │  (initial — first turn)
            └────────┬────────┘
                     │ all info collected
                     ▼
       ┌──────────────────────────┐
       │  winback_offered          │ ◄── customer hesitates
       └────────┬─────────────────┘
                │ accepted? ─── yes ──► [completed: kept]
                │ no
                ▼
   ┌────────────────────────┐
   │ awaiting_customer_     │
   │ confirm                │ ◄── breakdown sent
   └────────┬───────────────┘
            │ customer confirms
            ▼
  ┌────────────────────┐
  │ awaiting_manager   │ ◄── if 3+ cycles or TH5
  └────────┬───────────┘
           │ approved
           ▼
   ┌──────────────────┐
   │ refund_issued    │ ◄── refund processed in Shopify
   └────────┬─────────┘
            │
            ▼
       ┌──────────┐
       │ completed│
       └──────────┘

  Other states:
   ├── offer_sent / bill_sent   (checkpoint after sending an offer / breakdown)
   ├── awaiting_bill_paid       (TH4 — Upcoming / failed bill)
   ├── awaiting_option_choice   (TH4 — Option A/B / App Credit)
   ├── forwarded_to_human       (handed off to a human agent)
   ├── rejected                 (manager rejected)
   └── abandoned                (customer disappeared)
```

Stage values are persisted in the `cases.stage` column. They drive the resume logic when a customer returns mid-flow — Hugo loads `get_case_state` and continues from whatever stage was last recorded.

**Save after every step.** `save_case_state` is meant to be called after *every* handling action (info collected, offer sent, breakdown sent, escalation, human handoff, accept, process), each with the matching `stage` — not just once at the end. To keep a hallucinated stage from ever rejecting the whole save, `stage` is stored as free text (an enum would 400 the call on an unexpected value, silently losing the checkpoint — the same reason `crisp_conversation_id` is unvalidated).

---

## HARD GATE — calculate_refund / generate_refund_message

```
                   Hugo calls calculate_refund
                              │
                              ▼
           ┌─────────────────────────────────────┐
           │  Check 3 required input flags       │
           ├─────────────────────────────────────┤
           │  has_billing_invoice                │
           │  has_bank_confirmation              │
           │  verified_downgrade_complete        │
           └────────────┬────────────────────────┘
                        │
            ┌───────────┴───────────┐
            │                       │
       all true                  any false
            │                       │
            ▼                       ▼
   compute refund_amount    return BLOCKED message
   using prorated/full      "Missing: <list>. Call
   formula × deduction      collect_refund_info to
                            ask customer.
                            If plan still paid, ask
                            customer to downgrade
                            via Shopify Admin → Apps
                            → PageFly → Pricing
                            → Switch to Free, then
                            re-run check_subscription"
```

The same gate guards `generate_refund_message`, so Hugo cannot side-step `calculate_refund` to draft a quote.

`verified_downgrade_complete` deserves a callout: it must be backed by a fresh `check_subscription` reading `plan === "free"` or `status === "uninstalled" / "cancelled"`. A verbal "I just downgraded" is not enough; the gate refuses.

---

## Conversation identity — read from signed Crisp headers

Crisp signs every MCP request with headers that identify the live conversation:

| Header | Value | Used for |
|---|---|---|
| `x-crisp-session-id` | bare UUID (no `session_` prefix) | the conversation to tag / log |
| `x-crisp-website-id` | website UUID | which Crisp website to call |
| `x-crisp-timestamp` / `x-crisp-signature` | HMAC | request authenticity (not yet verified) |

`tag_case` and the `save_case_state` auto-tag read the session/website from
`extra.requestInfo.headers` (`extractCrispContext` in `src/crisp/client.ts`),
re-attach the `session_` prefix the REST API expects, and prefer the header
website id over `CRISP_WEBSITE_ID`. **The tool arguments are ignored for
identity** — `tag_case` takes no arguments at all, and `save_case_state`'s
`crisp_conversation_id` is an optional, unvalidated fallback.

> Historical note: identity used to come from a `crisp_session_id` tool
> argument that Hugo routinely hallucinated (`session_1111…`), so every Crisp
> meta call 404'd and nothing was ever tagged. Reading the signed header fixed
> it (see git history, June 2026).

## Tag flow — two-layer redundancy

```
                Customer message
                       │
            ┌──────────┴──────────┐
            │                     │
            ▼                     ▼
   Crisp Hugo MCP            Crisp webhook
   (tag_case, {})            (keyword flow)
            │                     │
   reads x-crisp-           ├── IF keyword "refund"
   session-id header        ├── GET conversation segs
            │               ├── merge "refund"
            ▼               ├── PATCH segs
   Crisp PATCH segments     └── ✓ done
   (always correct now)
```

`tag_case` is now reliable on its own (header-derived session), and the n8n
keyword webhook remains as a redundant safety net that pulls the session id
straight from the Crisp event payload.

## Ops-sheet logging — two phases into one row

Both `tag_case` and `save_case_state` POST a snapshot to `N8N_LOG_WEBHOOK_URL`
(`refund-log`), which appends/updates the [refund tracking sheet](https://docs.google.com/spreadsheets/d/127IllfOUCddKRVU73XoDy7I1kPHc4copi6yKem1yEkA/edit):

1. **`tag_case`** fires early (turn 1, on refund detection) with a minimal
   payload — `crisp_conversation_url`, `stage: "refund_detected"`,
   `assigned_agent: "AI"` — creating the skeleton row.
2. **`save_case_state`** fires later with the full case (refund_amount,
   option_chosen, resolution, notes, …), enriching the same row.

Both carry the same `crisp_conversation_url`, so the n8n Google Sheets node must
use **Append or Update Row matched on `Ticket ID`** — otherwise the second POST
creates a duplicate instead of updating. `logRefundCase` is best-effort and now
logs `[log-case] SKIP|POST|OK <status>|<error>` so the path is observable;
`fetch` does not throw on 4xx/5xx, so a missing/inactive webhook surfaces as a
logged non-2xx, not a silent miss.

Sheet column → payload field:

| Column | Field |
|---|---|
| Ticket ID | `crisp_conversation_url` |
| Created At | `created_at` / `logged_at` |
| Refund status | `resolution` / `stage` |
| Refund Amount ($) | `refund_amount` |
| Refund Type | `option_chosen` |
| Handled By | `assigned_agent` |
| Notes | `notes` |

---

## Where to look when something goes wrong

| Symptom | First place to check |
|---|---|
| Hugo skipped invoice / bank step | `pm2 logs refund-mcp | grep -E "calculate_refund|generate_refund_message"` — look for BLOCKED responses or missing flag inputs |
| Refund quoted while store still on paid plan | Same logs — check whether `verified_downgrade_complete: false` was passed |
| Tag not added to conversation | `pm2 logs refund-mcp | grep -E "tag_case"` — `START`/`OK` shows the header-derived session; a `FAIL … no x-crisp-session-id header` means the request didn't come through Crisp. n8n keyword flow is the safety net |
| Refund amount missing from the sheet | `grep "\[log-case\]"` — `SKIP` = `N8N_LOG_WEBHOOK_URL` unset; `404` = n8n webhook not Active; no `save_case_state` at all = Hugo skipped the save (see next row) |
| Hugo never calls `save_case_state` | Confirm with `grep save_case_state`. Hard gate #3 in the server instructions mandates it after `calculate_refund`/`generate_refund_message`; re-run **Refresh tools** in Crisp so the updated instructions load |
| Custom domain not resolved | `pm2 logs refund-mcp | grep "store-resolver"` — WAF/Cloudflare typically returns 503; fallback message is expected |
| Case state lost between sessions | Inspect Turso row by `store_url`; `crisp_conversation_id` is now set from the request header automatically |
