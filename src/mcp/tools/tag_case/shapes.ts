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

// The conversation session id is read from the signed "x-crisp-session-id"
// request header (authoritative), NOT from a tool argument — the upstream
// agent reliably hallucinates it. No input is required; the empty shape keeps
// the tool callable with `{}` so Hugo never has to (and never can) get it wrong.
const TAG_CASE_INPUT_SHAPE = {} satisfies ZodRawShape;

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
