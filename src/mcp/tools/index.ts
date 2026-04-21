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
import { registerGetCaseStateTool }         from "@/mcp/tools/get_case_state/main.js";
import { registerSaveCaseStateTool }        from "@/mcp/tools/save_case_state/main.js";
import { registerListPendingCasesTool }     from "@/mcp/tools/list_pending_cases/main.js";
import { registerTagCaseTool }              from "@/mcp/tools/tag_case/main.js";

/**************************************************************************
 * MAIN
 ***************************************************************************/

// Helper function to register our tools
function registerTools(server: McpServer): void {
  // Lookup tools — backed by in-memory fixtures
  registerCheckSubscriptionTool(server);
  registerGetBillingHistoryTool(server);

  // Pure-logic tools — deterministic rules and math
  registerClassifyRefundCaseTool(server);
  registerCalculateRefundTool(server);
  registerCollectRefundInfoTool(server);
  registerGenerateRefundMessageTool(server);

  // State tools — backed by Turso (libSQL) for cross-conversation continuity
  registerGetCaseStateTool(server);
  registerSaveCaseStateTool(server);
  registerListPendingCasesTool(server);

  // Crisp side-effect tools — write back into the Crisp conversation
  registerTagCaseTool(server);
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { registerTools };
