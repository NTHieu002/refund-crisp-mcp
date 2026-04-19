/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";
import type { ZodRawShape } from "zod";

/**************************************************************************
 * INPUT
 ***************************************************************************/

const COLLECT_REFUND_INFO_INPUT_SHAPE = {
  has_store_url          : z.boolean().describe("Whether the Shopify store URL has been collected"),
  has_billing_invoice    : z.boolean().describe("Whether the customer has shared a billing invoice (PDF or screenshot)"),
  has_refund_reason      : z.boolean().describe("Whether the customer has explained the reason for the refund"),
  has_bank_confirmation  : z.boolean().describe("Whether the customer has confirmed the bank account / payment method"),
  is_downgraded_to_free  : z.boolean().describe("Whether the store has been downgraded to the Free plan"),
  app_status             : z
    .enum(["installed", "uninstalled", "unknown"])
    .default("unknown")
    .describe("Whether the PageFly app is still installed (downgrade is not required if uninstalled)"),
  store_status : z
    .enum(["active", "closed", "unknown"])
    .default("unknown")
    .describe("Whether the Shopify store is still open (downgrade is not required if closed)"),
  bill_status : z
    .enum(["paid", "upcoming", "unknown"])
    .describe("Current bill status. Refunds can only be issued once the bill is Paid."),
} satisfies ZodRawShape;

/**************************************************************************
 * OUTPUT
 ***************************************************************************/

const COLLECT_REFUND_INFO_OUTPUT_SHAPE = {
  ready_to_process : z
    .boolean()
    .describe("True when all required information is collected and all blockers are cleared"),
  missing_items : z
    .array(z.string())
    .describe("List of pieces of information still missing from the customer"),
  next_question : z
    .string()
    .describe("Suggested next question to ask the customer (empty string when ready)"),
  blocker : z
    .string()
    .nullable()
    .describe("Current blocker preventing the refund (e.g. bill is Upcoming, plan still on paid). Null if no blocker."),
} satisfies ZodRawShape;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { COLLECT_REFUND_INFO_INPUT_SHAPE, COLLECT_REFUND_INFO_OUTPUT_SHAPE };

export type CollectRefundInfoInput  = z.infer<z.ZodObject<typeof COLLECT_REFUND_INFO_INPUT_SHAPE>>;
export type CollectRefundInfoOutput = z.infer<z.ZodObject<typeof COLLECT_REFUND_INFO_OUTPUT_SHAPE>>;
