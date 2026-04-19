/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerCheckSubscriptionTool }    from "@/mcp/tools/check_subscription/main.js";
import { registerGetBillingHistoryTool }    from "@/mcp/tools/get_billing_history/main.js";
import { registerCalculateRefundTool }      from "@/mcp/tools/calculate_refund/main.js";
import { registerClassifyRefundCaseTool }   from "@/mcp/tools/classify_refund_case/main.js";
import { registerCollectRefundInfoTool }    from "@/mcp/tools/collect_refund_info/main.js";
import { registerGenerateRefundMessageTool } from "@/mcp/tools/generate_refund_message/main.js";

/**************************************************************************
 * MAIN
 ***************************************************************************/

// Helper function to register our tools
function registerTools(server: McpServer): void {
  registerCheckSubscriptionTool(server);
  registerGetBillingHistoryTool(server);
  registerCalculateRefundTool(server);
  registerClassifyRefundCaseTool(server);
  registerCollectRefundInfoTool(server);
  registerGenerateRefundMessageTool(server);
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { registerTools };
