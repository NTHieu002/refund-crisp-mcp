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

        MANDATORY — call this tool IMMEDIATELY, before any other action, the
        moment you detect the customer is talking about a refund-related
        problem. Trigger phrases include (non-exhaustive): refund, "money
        back", cancel, unsubscribe, downgrade, "stop charges", chargeback,
        "wrong charge", "double charge", "auto-upgrade", overcharge, "hoàn
        tiền", "hủy gói", "trả lại tiền". If in doubt, tag — it is cheaper
        to over-tag than to miss a real refund case.

        Call order on turn 1 of a refund conversation:
          get_case_state → tag_case → collect_refund_info → ...
        Also call again on every subsequent turn alongside "save_case_state"
        as a safety net. The call is idempotent (existing tags preserved,
        "refund" deduped) so over-calling has no cost.

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
