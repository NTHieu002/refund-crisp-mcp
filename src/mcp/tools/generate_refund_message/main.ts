/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { generateRefundMessageHandler } from "@/mcp/tools/generate_refund_message/handler.js";
import {
  GENERATE_REFUND_MESSAGE_INPUT_SHAPE,
  GENERATE_REFUND_MESSAGE_OUTPUT_SHAPE,
} from "@/mcp/tools/generate_refund_message/shapes.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  GenerateRefundMessageInput,
  GenerateRefundMessageOutput,
} from "@/mcp/tools/generate_refund_message/shapes.js";

/**************************************************************************
 * TOOL
 ***************************************************************************/

// Defining and registering our "generate_refund_message" tool
function registerGenerateRefundMessageTool(server: McpServer): void {
  server.registerTool(
    "generate_refund_message",
    {
      title       : "Generate refund message",
      description : `
        Use this tool to draft the reply that will be sent to the customer, combining
        the PageFly refund templates (intro, win-back offer, refund breakdown,
        Upcoming-bill options, case-specific blocks) into a single message.

        Common use-cases include:
        - Drafting a prorated refund message with a breakdown (TH1, TH3, TH7)
        - Drafting the explanation for a perceived double-charge (TH2)
        - Drafting the Upcoming-bill two-option message (TH4)
        - Drafting the holding message for unauthorized auto-upgrade (TH5)
        - Drafting the downgrade instructions when the customer just wants to stop
          charges (TH6)
        - Drafting a polite decline (TH8, or is_decline=true) — set decline_reason.
          A decline skips the gate (no payout details needed to decline).
        - Drafting the App-Credit offer when the bill FAILED (bill_status=failed).
        - Drafting a discount-overcharge correction (is_discount_adjustment=true).

        Every quoted amount is framed as an ESTIMATE subject to review; when a
        Manager must approve (TH5, 3+ cycles, discount adjustment) the message says
        so explicitly. Pass bill_currency / bill_display_amount when the bill is not
        in USD so the message clarifies the refund is processed in USD.

        Call this tool after "classify_refund_case" and "calculate_refund". The
        returned message should still be reviewed by the agent before being sent.

        PRECONDITION: do NOT call this tool until "collect_refund_info" has
        returned "ready_to_process: true". Quoting a refund amount before the
        customer has shared refund_reason, store_url, billing_invoice and
        bank_confirmation is a policy violation. (Declines and failed-bill App-Credit
        offers are exempt — there is no refund amount to quote.)

        MANDATORY FOLLOW-UP: immediately after you send ANY message produced here,
        call "save_case_state" with store_url and the stage that matches what you
        sent — win-back → offer_sent; refund breakdown → bill_sent (then
        awaiting_customer_confirm); TH4 / App-Credit options → awaiting_option_choice;
        decline (TH8) → completed (resolution: declined). Include refund_amount,
        deduction_percent and case_type whenever a number was quoted. Save AGAIN
        when the customer accepts (refund_approved) and when it is processed
        (refund_issued → completed). Do NOT end the conversation without saving —
        skipping it loses the case from the database and the refund amount from the
        ops sheet.
      `,
      inputSchema  : GENERATE_REFUND_MESSAGE_INPUT_SHAPE,
      outputSchema : GENERATE_REFUND_MESSAGE_OUTPUT_SHAPE,
    },
    async (input: GenerateRefundMessageInput) => {
      const output: GenerateRefundMessageOutput = generateRefundMessageHandler(input);

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

export { registerGenerateRefundMessageTool };
