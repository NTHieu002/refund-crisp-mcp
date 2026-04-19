/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { getCaseStateHandler } from "@/mcp/tools/get_case_state/handler.js";
import {
  GET_CASE_STATE_INPUT_SHAPE,
  GET_CASE_STATE_OUTPUT_SHAPE,
} from "@/mcp/tools/get_case_state/shapes.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  GetCaseStateInput,
  GetCaseStateOutput,
} from "@/mcp/tools/get_case_state/shapes.js";

/**************************************************************************
 * TOOL
 ***************************************************************************/

// Defining and registering our "get_case_state" tool
function registerGetCaseStateTool(server: McpServer): void {
  server.registerTool(
    "get_case_state",
    {
      title       : "Get refund case state",
      description : `
        Use this tool to load the persisted state of a refund case by store URL.
        This is the first thing to call at the start of a refund conversation so
        that the AI can see what has already been done (winback offered, breakdown
        sent, manager status, etc.) and continue seamlessly.

        Returns null when no case has been saved yet — in that situation, start a
        fresh collect_refund_info pass and create the case with save_case_state.
      `,
      inputSchema  : GET_CASE_STATE_INPUT_SHAPE,
      outputSchema : GET_CASE_STATE_OUTPUT_SHAPE,
    },
    async (input: GetCaseStateInput) => {
      const output: GetCaseStateOutput = await getCaseStateHandler(input);

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

export { registerGetCaseStateTool };
