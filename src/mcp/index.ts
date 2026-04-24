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
        - Classify a refund request into one of the 7 playbook cases (TH1–TH7)
          and get back the recommended action, deduction and escalation flags
          (classify_refund_case)
        - Compute a prorated or multi-cycle refund with the correct deduction
          (calculate_refund)
        - Decide which piece of information to ask the customer next, and surface
          current blockers such as an Upcoming bill or a plan still on paid
          (collect_refund_info)
        - Draft the customer-facing reply combining the PageFly refund templates
          (generate_refund_message)
        - Attach the "refund" segment to the current Crisp conversation so
          ops can filter refund cases from the Crisp dashboard (tag_case)

        Typical flow:
          get_case_state → collect_refund_info → check_subscription →
          get_billing_history → classify_refund_case → calculate_refund →
          generate_refund_message → save_case_state → tag_case

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
           that calls "save_case_state". It is idempotent; skipping it leaves
           the case untagged in Crisp and breaks ops filtering.

        State tools (get_case_state, save_case_state, list_pending_cases) persist
        case data in Turso so that if a customer returns a day later, the AI
        resumes exactly where it left off (winback already offered, manager
        pending, bill still Upcoming, etc.). Call get_case_state at the start
        of a conversation and save_case_state after every meaningful step.

        Call tag_case once per refund conversation (idempotent) so every
        refund case carries the "refund" segment and the ops team can filter
        them from the Crisp dashboard without manual tagging.

        All refunds follow a 30-day cycle and PageFly's deduction policy
        (0% full refund when a team member has committed, 20% default, 40% for
        multi-cycle unused refunds). Any refund of 3+ cycles and any case of
        unauthorized auto-upgrade must be escalated to Manager (Boo).
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
