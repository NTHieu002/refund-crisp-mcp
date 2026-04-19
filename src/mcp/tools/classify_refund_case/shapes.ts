/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";
import type { ZodRawShape } from "zod";

/**************************************************************************
 * CONSTANTS
 ***************************************************************************/

const CASE_TYPES = ["TH1", "TH2", "TH3", "TH4", "TH5", "TH6", "TH7"] as const;

/**************************************************************************
 * INPUT
 ***************************************************************************/

const CLASSIFY_REFUND_CASE_INPUT_SHAPE = {
  reason : z
    .string()
    .describe(
      "Customer's stated reason in their own words (e.g. 'I uninstalled and want a refund').",
    ),
  store_status : z
    .enum(["active", "closed"])
    .describe("Whether the Shopify store is still open or has been closed."),
  app_status : z
    .enum(["installed", "uninstalled"])
    .describe("Whether the PageFly app is still installed on the store."),
  plan_status : z
    .enum(["paid", "free"])
    .describe(
      "Whether the store is currently on a paid plan or has already been downgraded to Free.",
    ),
  bill_status : z
    .enum(["paid", "upcoming"])
    .describe("Status of the bill the customer is asking a refund for."),
  num_cycles_requested : z
    .number()
    .int()
    .min(1)
    .describe("Number of cycles the customer is asking to be refunded."),
  is_angry : z
    .boolean()
    .describe(
      "True if the customer is angry, threatens a bad review, or threatens to escalate to Shopify.",
    ),
  has_prior_commitment : z
    .boolean()
    .describe(
      "True if a PageFly team member has previously committed to a (full) refund in the conversation history.",
    ),
} satisfies ZodRawShape;

/**************************************************************************
 * OUTPUT
 ***************************************************************************/

const CLASSIFY_REFUND_CASE_OUTPUT_SHAPE = {
  case_type : z
    .enum(CASE_TYPES)
    .describe("Matching case identifier from the refund playbook (TH1 to TH7)."),
  case_description : z
    .string()
    .describe("Short human-readable description of the matched case."),
  can_self_decide : z
    .boolean()
    .describe("True when the agent is allowed to proceed without manager approval."),
  needs_manager : z
    .boolean()
    .describe("True when the refund requires Manager (Boo) approval before processing."),
  needs_shift_manager : z
    .boolean()
    .describe("True when a Shift Manager must be mentioned (angry customer, threats)."),
  recommended_action : z
    .string()
    .describe("One-paragraph recommendation on how to handle the case."),
  deduction_percent : z
    .number()
    .describe("Suggested deduction percent (0, 20 or 40)."),
  requires_downgrade : z
    .boolean()
    .describe("Whether the store must be downgraded to Free before the refund can be issued."),
  requires_bill_paid : z
    .boolean()
    .describe("Whether the bill must reach Paid status before the refund can be issued."),
} satisfies ZodRawShape;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { CLASSIFY_REFUND_CASE_INPUT_SHAPE, CLASSIFY_REFUND_CASE_OUTPUT_SHAPE };

export type ClassifyRefundCaseInput  = z.infer<z.ZodObject<typeof CLASSIFY_REFUND_CASE_INPUT_SHAPE>>;
export type ClassifyRefundCaseOutput = z.infer<z.ZodObject<typeof CLASSIFY_REFUND_CASE_OUTPUT_SHAPE>>;
