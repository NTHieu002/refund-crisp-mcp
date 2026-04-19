/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { listPendingCasesHandler } from "@/mcp/tools/list_pending_cases/handler.js";
import {
  LIST_PENDING_CASES_INPUT_SHAPE,
  LIST_PENDING_CASES_OUTPUT_SHAPE,
} from "@/mcp/tools/list_pending_cases/shapes.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  ListPendingCasesInput,
  ListPendingCasesOutput,
} from "@/mcp/tools/list_pending_cases/shapes.js";

/**************************************************************************
 * TOOL
 ***************************************************************************/

// Defining and registering our "list_pending_cases" tool
function registerListPendingCasesTool(server: McpServer): void {
  server.registerTool(
    "list_pending_cases",
    {
      title       : "List refund cases",
      description : `
        Use this tool to list refund cases ordered by most recent activity, optionally
        filtered by stage.

        Common use-cases include:
        - Daily review of cases awaiting Manager approval (stage: awaiting_manager)
        - Finding conversations that went quiet for follow-up (stage:
          awaiting_customer_confirm)
        - Getting an overview of the refund pipeline

        Results are capped to 'limit' rows (default 50, max 200). No filter means
        all cases.
      `,
      inputSchema  : LIST_PENDING_CASES_INPUT_SHAPE,
      outputSchema : LIST_PENDING_CASES_OUTPUT_SHAPE,
    },
    async (input: ListPendingCasesInput) => {
      const output: ListPendingCasesOutput = await listPendingCasesHandler(input);

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

export { registerListPendingCasesTool };
