/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";
import type { ZodRawShape } from "zod";

/**************************************************************************
 * CONSTANTS
 ***************************************************************************/

// Tags used across the refund playbook. Hugo should pick the one matching
// the current stage of the case. Extend this list when new tags are agreed
// with the support team.
const REFUND_TAGS = [
  "refund-done",
  "refund-pending",
  "refund-rejected",
  "refund-awaiting-manager",
  "winback-success",
  "escalated",
] as const;

/**************************************************************************
 * INPUT
 ***************************************************************************/

const TAG_CASE_INPUT_SHAPE = {
  crisp_session_id : z
    .string()
    .describe("Crisp conversation session ID (e.g. session_3d1ba9ea-...)"),
  tag : z
    .enum(REFUND_TAGS)
    .describe(
      "Tag to attach to the Crisp conversation. Use 'refund-done' after a successful refund, 'refund-awaiting-manager' when waiting for Manager (Boo) approval, 'escalated' when the case was forwarded to a Shift Manager, etc.",
    ),
} satisfies ZodRawShape;

/**************************************************************************
 * OUTPUT
 ***************************************************************************/

const TAG_CASE_OUTPUT_SHAPE = {
  success      : z.boolean().describe("Whether the tag was attached to the conversation"),
  applied_tag  : z.string().nullable().describe("The tag that was attached, or null on failure"),
  all_segments : z
    .array(z.string())
    .describe("Full list of segments/tags on the conversation after the update"),
  error        : z.string().nullable().describe("Error message when the Crisp API call fails, otherwise null"),
} satisfies ZodRawShape;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { TAG_CASE_INPUT_SHAPE, TAG_CASE_OUTPUT_SHAPE, REFUND_TAGS };

export type TagCaseInput  = z.infer<z.ZodObject<typeof TAG_CASE_INPUT_SHAPE>>;
export type TagCaseOutput = z.infer<z.ZodObject<typeof TAG_CASE_OUTPUT_SHAPE>>;
