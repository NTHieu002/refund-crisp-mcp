/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { saveCaseStateHandler } from "@/mcp/tools/save_case_state/handler.js";
import {
  SAVE_CASE_STATE_INPUT_SHAPE,
  SAVE_CASE_STATE_OUTPUT_SHAPE,
} from "@/mcp/tools/save_case_state/shapes.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  SaveCaseStateInput,
  SaveCaseStateOutput,
} from "@/mcp/tools/save_case_state/shapes.js";

/**************************************************************************
 * TOOL
 ***************************************************************************/

// Defining and registering our "save_case_state" tool
function registerSaveCaseStateTool(server: McpServer): void {
  server.registerTool(
    "save_case_state",
    {
      title       : "Save refund case state",
      description : `
        Use this tool to persist (create or update) the state of a refund case so that
        it can be resumed in a future conversation. Every field except store_url is
        optional; the tool performs a partial upsert using store_url as the primary
        key.

        Common use-cases include:
        - Saving the case after a classification pass (case_type, stage, deduction)
        - Marking progress in the conversation (winback_offered, breakdown_sent,
          breakdown_confirmed, option_chosen)
        - Recording escalation state (needs_manager, manager_status,
          manager_approved_amount)
        - Completing the post-refund checklist (refund_processed_at,
          crisp_tag_refund_done, form_submitted)

        Call this tool any time you make meaningful progress on the case, so that if
        the customer returns a day later the full state is already there.
      `,
      inputSchema  : SAVE_CASE_STATE_INPUT_SHAPE,
      outputSchema : SAVE_CASE_STATE_OUTPUT_SHAPE,
    },
    async (input: SaveCaseStateInput) => {
      const output: SaveCaseStateOutput = await saveCaseStateHandler(input);

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

export { registerSaveCaseStateTool };
