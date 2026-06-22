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
        - 0%  → full refund: honored commitment, PageFly fault, trial, returning customer
        - 10% → split Shopify fees equally: yearly plan, or customer pushed back on 20%
        - 20% → default: 15% Shopify transaction fee + 5% maintenance
        - 40% → infrastructure & maintenance cost for 3+ unused cycles

        Special inputs:
        - already_refunded_amount > 0 → the tool refuses (never refund a charge twice).
        - discount_adjustment → for a promised-discount overcharge: refunds the
          difference (charge − list_price × (1 − discount%)), no proration/deduction,
          and the downgrade precondition is waived (the customer keeps their plan).
          Always have a Manager verify the discount proof.

        The refund_amount is an ESTIMATE. Present it to the customer as
        "the estimated refund would be approximately $X", subject to review — not as
        a final, confirmed figure. If the single-cycle result is $0 because the full
        cycle was used, do NOT quote $0; treat it as a TH8 decline.

        Use this tool after "check_subscription" and "get_billing_history" have
        established the charge amount and current cycle window.

        PRECONDITION: do NOT call this tool until "collect_refund_info" has
        returned "ready_to_process: true" in the current conversation. If it
        has not, go back and ask the customer for the missing items
        (refund_reason, store_url, billing_invoice, bank_confirmation).

        FOLLOW-UP: once you have a refund_amount here, you MUST persist it with
        "save_case_state" (store_url + refund_amount + deduction_percent +
        case_type + stage) before the conversation ends — do not skip it.
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
