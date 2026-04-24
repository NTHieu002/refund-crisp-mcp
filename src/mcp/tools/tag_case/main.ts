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

        MANDATORY: call this tool on the FIRST turn where the conversation is
        identified as a refund request — right after "get_case_state", before
        you ask any clarifying question. Also call it again together with
        "save_case_state" on every subsequent turn as a safety net. The
        call is idempotent (existing tags preserved, "refund" deduped) so
        calling it multiple times has no cost.

        A successful call returns "success: true" with the updated segments
        list. If it returns "success: false", retry once and surface the
        error to the support team — do NOT silently continue.

        The tag is constant ("refund") — no arguments other than the Crisp
        session ID are needed.
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
