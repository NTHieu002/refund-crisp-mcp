/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { addConversationTags, crispConversationUrl } from "@/crisp/client.js";
import { logRefundCase } from "@/log/client.js";

import { REFUND_TAG } from "@/mcp/tools/tag_case/shapes.js";
import type { TagCaseOutput } from "@/mcp/tools/tag_case/shapes.js";

/**************************************************************************
 * TYPES
 ***************************************************************************/

// session/website are resolved in main.ts from the Crisp request headers
// (authoritative) before reaching the handler — NOT from the tool arguments,
// which the upstream agent routinely fills with a hallucinated session id.
interface TagCaseArgs {
  sessionId : string | null;
  websiteId : string | null;
}

/**************************************************************************
 * HANDLER
 ***************************************************************************/

async function tagCaseHandler({ sessionId, websiteId }: TagCaseArgs): Promise<TagCaseOutput> {
  if (!sessionId) {
    console.error("[tag_case] FAIL — no x-crisp-session-id header on the request");

    return {
      success      : false,
      all_segments : [],
      error        :
        "No Crisp session id on the request (missing 'x-crisp-session-id' " +
        "header). Ensure the MCP server is reached through Crisp.",
    };
  }

  console.log(`[tag_case] START session=${sessionId} website=${websiteId ?? "(env)"}`);

  try {
    const all_segments = await addConversationTags(sessionId, [REFUND_TAG], websiteId);

    console.log(`[tag_case] OK  session=${sessionId} segments=${JSON.stringify(all_segments)}`);

    // Create the ops-sheet row the moment a refund is detected. tag_case fires
    // reliably on turn 1, whereas save_case_state may run late or never — this
    // captures early-stage tickets (the sheet's "Waiting cx respond" rows).
    // Best-effort: never let an ops-log miss fail the tag. n8n upserts on the
    // Ticket ID (conversation URL), so save_case_state later updates the row.
    const wid = websiteId ?? process.env.CRISP_WEBSITE_ID ?? null;
    void logRefundCase({
      crisp_conversation_id  : sessionId,
      crisp_website_id       : wid,
      crisp_conversation_url : crispConversationUrl(wid, sessionId),
      stage                  : "refund_detected",
      assigned_agent         : "AI",
    });

    return {
      success      : true,
      all_segments : all_segments,
      error        : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`[tag_case] FAIL session=${sessionId}: ${message}`);

    return {
      success      : false,
      all_segments : [],
      error        : message,
    };
  }
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { tagCaseHandler };
