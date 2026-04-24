/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { calculateRefundHandler } from "@/mcp/tools/calculate_refund/handler.js";
import {
  CALCULATE_REFUND_INPUT_SHAPE,
  CALCULATE_REFUND_OUTPUT_SHAPE,
} from "@/mcp/tools/calculate_refund/shapes.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CalculateRefundInput,
  CalculateRefundOutput,
} from "@/mcp/tools/calculate_refund/shapes.js";

/**************************************************************************
 * TOOL
 ***************************************************************************/

// Defining and registering our "calculate_refund" tool
function registerCalculateRefundTool(server: McpServer): void {
  server.registerTool(
    "calculate_refund",
    {
      title       : "Calculate PageFly refund",
      description : `
        Use this tool to compute the refund amount a customer should receive, following
        PageFly's 30-day cycle proration rules and deduction policy.

        Common use-cases include:
        - Prorated refund when the customer cancelled or downgraded mid-cycle
          (num_cycles = 1)
        - Full refund across multiple unused cycles, minus deduction
          (num_cycles >= 2)

        Deduction policy:
        - 0%  → full refund, only when a team member has committed to it
        - 20% → default: 15% Shopify transaction fee + 5% maintenance
        - 40% → infrastructure & maintenance cost for multiple unused cycles

        Use this tool after "check_subscription" and "get_billing_history" have
        established the charge amount and current cycle window.

        PRECONDITION: do NOT call this tool until "collect_refund_info" has
        returned "ready_to_process: true" in the current conversation. If it
        has not, go back and ask the customer for the missing items
        (refund_reason, store_url, billing_invoice, bank_confirmation).
      `,
      inputSchema  : CALCULATE_REFUND_INPUT_SHAPE,
      outputSchema : CALCULATE_REFUND_OUTPUT_SHAPE,
    },
    async (input: CalculateRefundInput) => {
      const output: CalculateRefundOutput = calculateRefundHandler(input);

      return {
        content : [
          {
            type : "text",
            text : JSON.stringify(output, null, 2),
          },
        ],
        structuredContent : output,
      };
    },
  );
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { registerCalculateRefundTool };
