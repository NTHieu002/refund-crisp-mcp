/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { addConversationTags } from "@/crisp/client.js";

import { REFUND_TAG } from "@/mcp/tools/tag_case/shapes.js";
import type { TagCaseInput, TagCaseOutput } from "@/mcp/tools/tag_case/shapes.js";

/**************************************************************************
 * HANDLER
 ***************************************************************************/

async function tagCaseHandler(input: TagCaseInput): Promise<TagCaseOutput> {
  console.log(`[tag_case] START session=${input.crisp_session_id}`);

  try {
    const all_segments = await addConversationTags(input.crisp_session_id, [REFUND_TAG]);

    console.log(`[tag_case] OK  session=${input.crisp_session_id} segments=${JSON.stringify(all_segments)}`);

    return {
      success      : true,
      all_segments : all_segments,
      error        : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`[tag_case] FAIL session=${input.crisp_session_id}: ${message}`);

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
