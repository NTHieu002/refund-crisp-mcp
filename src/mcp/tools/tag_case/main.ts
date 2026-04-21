/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { tagCaseHandler } from "@/mcp/tools/tag_case/handler.js";
import {
  TAG_CASE_INPUT_SHAPE,
  TAG_CASE_OUTPUT_SHAPE,
} from "@/mcp/tools/tag_case/shapes.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  TagCaseInput,
  TagCaseOutput,
} from "@/mcp/tools/tag_case/shapes.js";

/**************************************************************************
 * TOOL
 ***************************************************************************/

// Defining and registering our "tag_case" tool
function registerTagCaseTool(server: McpServer): void {
  server.registerTool(
    "tag_case",
    {
      title       : "Tag Crisp conversation as refund",
      description : `
        Use this tool to attach the "refund" segment to the current Crisp
        conversation so every refund case is filterable from the Crisp
        dashboard.

        Call this tool as soon as you identify that the conversation is
        about a refund — usually right after "get_case_state" on the first
        turn, or after "classify_refund_case" on a later turn.

        The tag is constant ("refund") — no arguments other than the Crisp
        session ID are needed. Existing tags on the conversation are
        preserved; calling this tool multiple times on the same conversation
        is safe (idempotent).
      `,
      inputSchema  : TAG_CASE_INPUT_SHAPE,
      outputSchema : TAG_CASE_OUTPUT_SHAPE,
    },
    async (input: TagCaseInput) => {
      const output: TagCaseOutput = await tagCaseHandler(input);

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

export { registerTagCaseTool };
