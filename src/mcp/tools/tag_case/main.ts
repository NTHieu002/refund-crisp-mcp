/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { tagCaseHandler } from "@/mcp/tools/tag_case/handler.js";
import { extractCrispContext } from "@/crisp/client.js";
import {
  TAG_CASE_INPUT_SHAPE,
  TAG_CASE_OUTPUT_SHAPE,
} from "@/mcp/tools/tag_case/shapes.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TagCaseOutput } from "@/mcp/tools/tag_case/shapes.js";

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

        This tool takes NO arguments — call it with an empty object {}. The
        conversation is identified automatically from the signed Crisp request
        headers, so you never need to pass (or know) the session id.

        MANDATORY — call this tool IMMEDIATELY, before any other action, the
        moment you detect the customer is talking about a refund-related
        problem. Trigger phrases include (non-exhaustive): refund, "money
        back", cancel, unsubscribe, downgrade, "stop charges", chargeback,
        "wrong charge", "double charge", "auto-upgrade", overcharge, "hoàn
        tiền", "hủy gói", "trả lại tiền".

        DO NOT tag — and do not treat as a refund — a conversation that is
        PURELY a technical / bug / setup issue with NO money intent: OAuth /
        redirect_uri / login errors, install or editor bugs, broken or
        erroring pages, third-party-app problems (Releasit, Judge.me, etc.),
        or a promo / discount banner displaying wrong (a "20% off" sign, a
        Shopify "Sales" tag, a "% off" badge appearing on a page). Those are
        support tickets, not refund cases.

        The deciding test is INTENT, not topic. If the customer wants money
        back, to cancel, or to stop a charge — even when a bug is what
        triggered it ("the app is broken so I want a refund") — tag it. If in
        doubt WITHIN that money/cancel scope, tag. But a chat that only asks to
        fix a bug and never mentions money or cancellation must stay untagged.

        FALSE FRIENDS — the words "discount", "sale", "% off", "20% off",
        "Sales tag", "promo" almost always describe a storefront PROMO DISPLAY,
        not a PageFly refund. A discount SHOWING (or in the wrong spot) is a
        theme/display bug, never a request for money back. Do NOT tag on these
        words alone — only tag if the customer separately asks to be refunded
        or to cancel.

        Call order on turn 1 of a refund conversation:
          get_case_state → tag_case → collect_refund_info → ...
        Also call again on every subsequent turn alongside "save_case_state"
        as a safety net. The call is idempotent (existing tags preserved,
        "refund" deduped) so over-calling has no cost.

        A successful call returns "success: true" with the updated segments
        list. If it returns "success: false", retry once and surface the
        error to the support team — do NOT silently continue.
      `,
      inputSchema  : TAG_CASE_INPUT_SHAPE,
      outputSchema : TAG_CASE_OUTPUT_SHAPE,
    },
    async (_input, extra) => {
      const { sessionId, websiteId } = extractCrispContext(extra?.requestInfo?.headers);

      const output: TagCaseOutput = await tagCaseHandler({ sessionId, websiteId });

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
