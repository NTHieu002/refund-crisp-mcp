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
        Use this tool to classify a refund request into one of the 7 playbook cases
        (TH1 to TH7) and get back the recommended action, deduction and escalation
        flags.

        Common use-cases include:
        - Deciding whether to apply 0%, 20% or 40% deduction
        - Knowing whether the agent can self-decide or must escalate to Manager (Boo)
          / Shift Manager
        - Learning whether the store must first downgrade to Free and whether the
          bill must be Paid before the refund can be issued

        Input expects the customer's stated reason plus structured flags collected
        during the conversation. Call this tool once enough context is known, usually
        after "check_subscription" and "get_billing_history".
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
