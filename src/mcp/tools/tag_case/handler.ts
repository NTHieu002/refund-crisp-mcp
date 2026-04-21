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
  try {
    const all_segments = await addConversationTags(input.crisp_session_id, [REFUND_TAG]);

    return {
      success      : true,
      all_segments : all_segments,
      error        : null,
    };
  } catch (error) {
    return {
      success      : false,
      all_segments : [],
      error        : error instanceof Error ? error.message : String(error),
    };
  }
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { tagCaseHandler };
