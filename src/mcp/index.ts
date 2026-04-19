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

        Typical flow:
          collect_refund_info → check_subscription → get_billing_history →
          classify_refund_case → calculate_refund → generate_refund_message

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
