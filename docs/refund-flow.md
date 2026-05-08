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
│  Side effects from           │◄──┤  /website/.../conversation/.../ │
│  save_case_state:            │   │  meta (segments)                │
│  ├── Turso upsert            │   └─────────────────────────────────┘
│  ├── PATCH segment refund    │
│  └── POST log webhook        │
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

  Other terminal states:
   ├── awaiting_bill_paid       (TH4 — Upcoming bill)
   ├── awaiting_option_choice   (TH4 — Option A/B)
   ├── rejected                 (manager rejected)
   └── abandoned                (customer disappeared)
```

Stage values are persisted in the `cases.stage` column. They drive the resume logic when a customer returns mid-flow — Hugo loads `get_case_state` and continues from whatever stage was last recorded.

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

## Tag flow — two-layer redundancy

```
                Customer message
                       │
            ┌──────────┴──────────┐
            │                     │
            ▼                     ▼
   Crisp Hugo MCP            Crisp webhook
            │                     │
            ▼                     ▼
   tag_case (Hugo)         n8n webhook flow
   (sometimes              ├── IF keyword "refund"
    hallucinates           ├── GET conversation segs
    session_id)            ├── merge "refund"
            │              ├── PATCH segs
            │              └── ✓ done
            ▼
   Crisp PATCH segments
   (only works if Hugo
    passes correct
    session_id)
```

Hugo's MCP-driven tagging via `tag_case` and the auto-tag side effect on `save_case_state` both rely on the agent passing the live `session_id`, which Hugo has historically failed to provide reliably. The n8n keyword webhook is the authoritative path for the dashboard filter — it pulls the session id directly from the Crisp event payload, so it always tags correctly when the customer (or Hugo) mentions a refund-adjacent term.

---

## Where to look when something goes wrong

| Symptom | First place to check |
|---|---|
| Hugo skipped invoice / bank step | `pm2 logs refund-mcp | grep -E "calculate_refund|generate_refund_message"` — look for BLOCKED responses or missing flag inputs |
| Refund quoted while store still on paid plan | Same logs — check whether `verified_downgrade_complete: false` was passed |
| Tag not added to conversation | `pm2 logs refund-mcp | grep -E "tag_case|auto-tag"` for hallucinated session ids; check the n8n keyword flow execution log as the safety net |
| Custom domain not resolved | `pm2 logs refund-mcp | grep "store-resolver"` — WAF/Cloudflare typically returns 503; fallback message is expected |
| Case state lost between sessions | Inspect Turso row by `store_url`; verify `crisp_conversation_id` was passed on the last `save_case_state` |
