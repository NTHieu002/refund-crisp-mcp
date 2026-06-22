/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerTools } from "@/mcp/tools/index.js";

/**************************************************************************
 * MAIN
 ***************************************************************************/

// Configuring the MCP server with a name, version, and clear global description
function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name    : "refund-crisp-mcp",
      version : "1.0.0",
    },
    {
      instructions: `
        This server exposes tools to help the PageFly support team handle refund
        requests end-to-end. Use it to:

        - Look up a customer's PageFly subscription by store URL or email
          (check_subscription)
        - Retrieve the full PageFly billing history of a store, including Upcoming
          bills and PageFly earnings after Shopify fees (get_billing_history)
        - Check whether the store actually USED PageFly in a period (pages
          published / edited) to verify a "I never used it" claim (check_usage_data)
        - Classify a refund request into one of the 8 playbook cases (TH1–TH8,
          where TH8 = decline) and get back the recommended action, deduction and
          escalation flags + reason (classify_refund_case)
        - Compute a prorated, multi-cycle, or discount-adjustment refund with the
          correct deduction (calculate_refund)
        - Decide which piece of information to ask the customer next, and surface
          current blockers such as an Upcoming bill or a plan still on paid
          (collect_refund_info)
        - Draft the customer-facing reply combining the PageFly refund templates
          (generate_refund_message)
        - Attach the "refund" segment to the current Crisp conversation so
          ops can filter refund cases from the Crisp dashboard (tag_case)

        Typical flow:
          get_case_state → collect_refund_info → check_subscription →
          get_billing_history → (check_usage_data if "didn't use it" is claimed) →
          classify_refund_case → calculate_refund → generate_refund_message →
          save_case_state → tag_case

        HARD GATE — never skip:
        1. Call "collect_refund_info" at the start of every customer turn and
           obey "next_question" verbatim (including any URLs). Do NOT compute or
           quote a refund amount (no "calculate_refund", no
           "generate_refund_message") until "collect_refund_info" returns
           "ready_to_process: true", i.e. all of refund_reason + store_url +
           billing_invoice + bank_confirmation are collected AND no blocker is
           active.
        2. Call "tag_case" on the FIRST turn you identify the conversation as
           a refund — before any clarifying question — and again on every turn
           that calls "save_case_state". Call it with an empty object {}: the
           conversation is identified from the signed Crisp request headers, so
           you never pass a session id. It is idempotent; skipping it leaves
           the case untagged in Crisp and breaks ops filtering. Trigger on any
           refund-adjacent intent (refund, cancel, unsubscribe, downgrade,
           double charge, auto-upgrade, "hoàn tiền", "hủy gói", etc.) —
           over-tagging is safe, under-tagging is not.
        3. SAVE AFTER EVERY STEP. Call "save_case_state" after every action that
           changes the case — not only when a refund is quoted. Pass store_url
           plus whatever changed, and the stage that matches what just happened:
             - asked for / received info ......... stage: collecting_info
             - sent the win-back / any offer ..... stage: offer_sent (winback_offered: true)
             - sent the refund bill / breakdown .. stage: bill_sent (breakdown_sent: true)
             - quoted an amount, now waiting ..... stage: awaiting_customer_confirm
             - sent TH4 A/B or App-Credit option . stage: awaiting_option_choice
             - escalated to Manager (Boo) ........ stage: awaiting_manager (needs_manager: true, manager_status: pending)
             - forwarded the chat to a human ..... stage: forwarded_to_human (assigned_agent: <name>)
             - customer accepted ................. stage: refund_approved
             - refund processed in Shopify ....... stage: refund_issued (then completed)
             - declined (TH8) .................... stage: completed (resolution: declined)
           This is not optional: every save also re-tags Crisp and updates the
           ops sheet, so a missed step loses BOTH the resumable Turso state and
           the sheet row. If the customer goes quiet, SAVE FIRST with the current
           stage, then wait. When in doubt, save.

        Side effects: "save_case_state" also auto-tags the conversation and
        logs a row to the ops sheet on every successful save, so even if
        Hugo forgets to call "tag_case" directly, the DB save acts as a
        safety net. This does NOT remove the obligation above — tagging on
        turn 1 keeps the Crisp dashboard filter accurate in real-time.

        State tools (get_case_state, save_case_state, list_pending_cases) persist
        case data in Turso so that if a customer returns a day later, the AI
        resumes exactly where it left off (winback already offered, manager
        pending, bill still Upcoming, etc.). Call get_case_state at the start
        of a conversation and save_case_state after every meaningful step.

        Call tag_case once per refund conversation (idempotent) so every
        refund case carries the "refund" segment and the ops team can filter
        them from the Crisp dashboard without manual tagging.

        All refunds follow a 30-day cycle and PageFly's deduction policy:
        0% (honored commitment — human OR bot — / PageFly fault / service failure
        / trial / returning customer), 10% (yearly plan, or the customer pushes
        back on 20% — split Shopify fees equally), 20% (default), 40% (3+ unused
        cycles). The number you compute is an ESTIMATE: present it as
        "the estimated refund would be approximately $X, subject to review",
        never as a hard confirmed figure.

        ESCALATE TO MANAGER (Boo) — never self-decide — when ANY of these hold:
        3+ cycles, unauthorized auto-upgrade (TH5), a prior commitment, a LOYAL
        customer (subscribed 2+ years), a high-value account (yearly / multi-store
        / expensive plan), a frustrated / repeat-complaint customer, a bad-review
        risk, a customer who has ALREADY left a bad review (pivot to a full refund
        to recover), or a discount-commitment claim. These flags also PREVENT an
        automatic decline — a bad review from a loyal customer costs far more than
        one cycle.

        DECLINE (TH8) only an ordinary case where the billed cycle was fully used
        (cancelled after it ended) or check_usage_data proves active use — and the
        customer is none of the sensitive cases above. Decline politely on the
        Official Refund Policy; offer to refund only a fresh, unused partial cycle
        if a new charge has started. If the bill FAILED (store frozen, no money
        received) you cannot refund — offer an App Credit instead.
      `,
    },
  );

  registerTools(server);

  return server;
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { createMcpServer };
