/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { checkSubscriptionHandler } from "@/mcp/tools/check_subscription/handler.js";
import {
  CHECK_SUBSCRIPTION_INPUT_SHAPE,
  CHECK_SUBSCRIPTION_OUTPUT_SHAPE,
} from "@/mcp/tools/check_subscription/shapes.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CheckSubscriptionInput,
  CheckSubscriptionOutput,
} from "@/mcp/tools/check_subscription/shapes.js";

/**************************************************************************
 * TOOL
 ***************************************************************************/

// Defining and registering our "check_subscription" tool
function registerCheckSubscriptionTool(server: McpServer): void {
  server.registerTool(
    "check_subscription",
    {
      title       : "Check PageFly subscription",
      description : `
        Use this tool to retrieve a customer's PageFly subscription status, current plan,
        activation date and billing cycle window.

        Common use-cases include:
        - Confirming which plan and price a customer is currently on
        - Checking whether a subscription is active, cancelled, free or uninstalled
        - Locating the current 30-day billing cycle to feed prorated refund calculations

        Provide either the Shopify "store_url" or the customer "email". This tool is
        typically the first call in a refund flow before "get_billing_history" and
        "calculate_refund".
      `,
      inputSchema  : CHECK_SUBSCRIPTION_INPUT_SHAPE,
      outputSchema : CHECK_SUBSCRIPTION_OUTPUT_SHAPE,
    },
    async (input: CheckSubscriptionInput) => {
      const output: CheckSubscriptionOutput = checkSubscriptionHandler(input);

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

export { registerCheckSubscriptionTool };
