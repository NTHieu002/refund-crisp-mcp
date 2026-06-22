/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { classifyRefundCaseHandler } from "@/mcp/tools/classify_refund_case/handler.js";
import {
  CLASSIFY_REFUND_CASE_INPUT_SHAPE,
  CLASSIFY_REFUND_CASE_OUTPUT_SHAPE,
} from "@/mcp/tools/classify_refund_case/shapes.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  ClassifyRefundCaseInput,
  ClassifyRefundCaseOutput,
} from "@/mcp/tools/classify_refund_case/shapes.js";

/**************************************************************************
 * TOOL
 ***************************************************************************/

// Defining and registering our "classify_refund_case" tool
function registerClassifyRefundCaseTool(server: McpServer): void {
  server.registerTool(
    "classify_refund_case",
    {
      title       : "Classify refund case",
      description : `
        Use this tool to classify a refund request into one of the 8 playbook cases
        (TH1 to TH8) and get back the recommended action, deduction and escalation
        flags.

        Common use-cases include:
        - Deciding whether to apply 0%, 10%, 20% or 40% deduction
        - Deciding whether to DECLINE (TH8) — the cycle was fully used or usage data
          (check_usage_data) proves active use, and the customer is not loyal/at-risk
        - Knowing whether the agent can self-decide or must escalate to Manager (Boo)
          / Shift Manager — and WHY (manager_reason)
        - Learning whether the store must first downgrade to Free and whether the
          bill must be Paid before the refund can be issued

        Pass the sensitive-case flags accurately: subscription_age_years (2+ = loyal),
        is_high_value, is_frustrated, bad_review_risk, already_left_bad_review and
        discount_commitment_claim ALL force Manager review and PREVENT an automatic
        decline — a bad review from a loyal customer costs far more than one cycle.
        Pass feature_issue / service_failure / is_trial_period / is_returning_customer
        for full-refund (0%) situations, and is_yearly_plan / customer_counters_deduction
        for the 10% "split Shopify fees" rate.

        The deduction_percent returned is a SUGGESTION. Present any refund to the
        customer as an estimate subject to review — never as a hard, confirmed number.

        Input expects the customer's stated reason plus structured flags collected
        during the conversation. Call this tool once enough context is known, usually
        after "check_subscription", "get_billing_history" and (for "did not use it"
        claims) "check_usage_data".
      `,
      inputSchema  : CLASSIFY_REFUND_CASE_INPUT_SHAPE,
      outputSchema : CLASSIFY_REFUND_CASE_OUTPUT_SHAPE,
    },
    async (input: ClassifyRefundCaseInput) => {
      const output: ClassifyRefundCaseOutput = classifyRefundCaseHandler(input);

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

export { registerClassifyRefundCaseTool };
