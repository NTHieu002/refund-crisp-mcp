/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { getBillingHistoryHandler } from "@/mcp/tools/get_billing_history/handler.js";
import {
  GET_BILLING_HISTORY_INPUT_SHAPE,
  GET_BILLING_HISTORY_OUTPUT_SHAPE,
} from "@/mcp/tools/get_billing_history/shapes.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  GetBillingHistoryInput,
  GetBillingHistoryOutput,
} from "@/mcp/tools/get_billing_history/shapes.js";

/**************************************************************************
 * TOOL
 ***************************************************************************/

// Defining and registering our "get_billing_history" tool
function registerGetBillingHistoryTool(server: McpServer): void {
  server.registerTool(
    "get_billing_history",
    {
      title       : "Get PageFly billing history",
      description : `
        Use this tool to retrieve the full billing history of a Shopify store on PageFly,
        including all charges, invoice dates, PageFly earnings after Shopify fees,
        refunded amounts and bill statuses.

        Common use-cases include:
        - Verifying how many cycles the customer has actually paid for
        - Spotting an Upcoming bill (triggers the TH4 App Credit / post-pay refund flow)
        - Checking whether a cycle has already been refunded before issuing a new one

        Call this tool after "check_subscription" when you need to confirm the exact
        amount charged and the bill status before running "calculate_refund".
      `,
      inputSchema  : GET_BILLING_HISTORY_INPUT_SHAPE,
      outputSchema : GET_BILLING_HISTORY_OUTPUT_SHAPE,
    },
    async (input: GetBillingHistoryInput) => {
      const output: GetBillingHistoryOutput = await getBillingHistoryHandler(input);

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

export { registerGetBillingHistoryTool };
