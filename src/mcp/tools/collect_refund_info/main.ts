/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { collectRefundInfoHandler } from "@/mcp/tools/collect_refund_info/handler.js";
import {
  COLLECT_REFUND_INFO_INPUT_SHAPE,
  COLLECT_REFUND_INFO_OUTPUT_SHAPE,
} from "@/mcp/tools/collect_refund_info/shapes.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CollectRefundInfoInput,
  CollectRefundInfoOutput,
} from "@/mcp/tools/collect_refund_info/shapes.js";

/**************************************************************************
 * TOOL
 ***************************************************************************/

// Defining and registering our "collect_refund_info" tool
function registerCollectRefundInfoTool(server: McpServer): void {
  server.registerTool(
    "collect_refund_info",
    {
      title       : "Collect refund info",
      description : `
        Use this tool to check what information is still missing from the customer
        before a refund can be processed, and to get a suggested next question to
        ask.

        Common use-cases include:
        - Deciding which piece of context to ask for next
          (store URL, invoice, reason, bank confirmation)
        - Surfacing blockers such as an Upcoming bill or a plan still on paid,
          with an explanation the agent can relay to the customer
        - Knowing when the case is fully collected and ready for "calculate_refund"

        Call this tool at any point in the conversation to decide the next step.
      `,
      inputSchema  : COLLECT_REFUND_INFO_INPUT_SHAPE,
      outputSchema : COLLECT_REFUND_INFO_OUTPUT_SHAPE,
    },
    async (input: CollectRefundInfoInput) => {
      const output: CollectRefundInfoOutput = collectRefundInfoHandler(input);

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

export { registerCollectRefundInfoTool };
