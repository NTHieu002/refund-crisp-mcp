/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { addConversationTags } from "@/crisp/client.js";

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
