/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";
import type { ZodRawShape } from "zod";

/**************************************************************************
 * CONSTANTS
 ***************************************************************************/

// Single tag used to flag every refund-related Crisp conversation, regardless
// of stage or outcome. Keep it a constant so Hugo doesn't have to pick.
const REFUND_TAG = "refund";

/**************************************************************************
 * INPUT
 ***************************************************************************/

// Full Crisp session ID format: session_ + lowercase UUID (8-4-4-4-12 hex).
// Regex enforcement rejects placeholder / truncated values like
// "session_3d1ba9ea-..." that Hugo has been known to hallucinate.
const CRISP_SESSION_ID_REGEX =
  /^session_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const TAG_CASE_INPUT_SHAPE = {
  crisp_session_id : z
    .string()
    .regex(
      CRISP_SESSION_ID_REGEX,
      "crisp_session_id must be the FULL session id of the CURRENT conversation (format: session_ + 36-char UUID).",
    )
    .describe(
      "The current Crisp conversation session ID. Always pass the session_id from the active conversation.",
    ),
} satisfies ZodRawShape;

/**************************************************************************
 * OUTPUT
 ***************************************************************************/

const TAG_CASE_OUTPUT_SHAPE = {
  success      : z.boolean().describe("Whether the 'refund' tag was attached to the conversation"),
  all_segments : z
    .array(z.string())
    .describe("Full list of segments/tags on the conversation after the update"),
  error        : z.string().nullable().describe("Error message when the Crisp API call fails, otherwise null"),
} satisfies ZodRawShape;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { TAG_CASE_INPUT_SHAPE, TAG_CASE_OUTPUT_SHAPE, REFUND_TAG };

export type TagCaseInput  = z.infer<z.ZodObject<typeof TAG_CASE_INPUT_SHAPE>>;
export type TagCaseOutput = z.infer<z.ZodObject<typeof TAG_CASE_OUTPUT_SHAPE>>;
