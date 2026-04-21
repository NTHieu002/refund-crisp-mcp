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
      title       : "Tag Crisp conversation",
      description : `
        Use this tool to attach a segment/tag to the current Crisp conversation
        so the refund pipeline stays visible from the Crisp dashboard.

        Common use-cases include:
        - Marking a conversation as "refund-done" after a successful refund
          (matches the post-refund checklist step)
        - Marking "refund-awaiting-manager" while waiting for Boo's approval
        - Marking "escalated" when handing off to a Shift Manager
        - Marking "refund-rejected" when the refund was declined

        Call this tool after "save_case_state" whenever the case reaches a
        milestone that the ops team should be able to filter on in Crisp.

        Existing tags on the conversation are preserved — this tool adds to
        the segments array rather than replacing it.
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
