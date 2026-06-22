/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { saveCaseStateHandler } from "@/mcp/tools/save_case_state/handler.js";
import { extractCrispContext } from "@/crisp/client.js";
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

        CALL THIS AFTER EVERY STEP — not just at the end. Each handling action is
        a checkpoint that must be persisted with the matching "stage":
        - asked for / received info ......... stage: collecting_info
        - sent the win-back / any offer ..... stage: offer_sent (winback_offered: true)
        - sent the refund bill / breakdown .. stage: bill_sent (breakdown_sent: true)
        - quoted an amount, now waiting ..... stage: awaiting_customer_confirm
        - sent TH4 A/B or App-Credit option . stage: awaiting_option_choice
        - escalated to Manager (Boo) ........ stage: awaiting_manager (needs_manager: true, manager_status: pending)
        - forwarded the chat to a human ..... stage: forwarded_to_human (assigned_agent: <name>)
        - customer accepted ................. stage: refund_approved
        - refund processed in Shopify ....... stage: refund_issued (then completed)
        - declined (TH8) .................... stage: completed (resolution: declined)

        Every save also re-tags the Crisp conversation and updates the ops sheet, so a
        missed step loses both the resumable state AND the sheet row. When in doubt,
        save. If the customer goes quiet, SAVE FIRST (with the current stage), then wait.

        Other common fields:
        - Marking progress in the conversation (winback_offered, breakdown_sent,
          breakdown_confirmed, option_chosen)
        - Recording escalation state (needs_manager, manager_status,
          manager_approved_amount, manager_brief)
        - Completing the post-refund checklist (refund_processed_at,
          crisp_tag_refund_done, form_submitted)

        Uninstall reason: when the customer tells you why they cancelled, downgraded,
        or uninstalled PageFly, capture it in the "notes" field with the exact prefix
        "[uninstall_reason] " followed by their reason (verbatim quote preferred,
        short paraphrase OK). Example:
          notes: "[uninstall_reason] Too expensive after the recent price increase"
        Ops will grep notes by this prefix to track churn drivers.
      `,
      inputSchema  : SAVE_CASE_STATE_INPUT_SHAPE,
      outputSchema : SAVE_CASE_STATE_OUTPUT_SHAPE,
    },
    async (input: SaveCaseStateInput, extra) => {
      const context = extractCrispContext(extra?.requestInfo?.headers);

      const output: SaveCaseStateOutput = await saveCaseStateHandler(input, context);

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
