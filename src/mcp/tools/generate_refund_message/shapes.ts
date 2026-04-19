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

const CYCLE_INPUT_SHAPE = {
  start  : z.string().describe("Cycle start date in ISO format (UTC)"),
  end    : z.string().describe("Cycle end date in ISO format (UTC)"),
  amount : z.number().describe("Charge amount for this cycle in USD"),
} satisfies ZodRawShape;

const GENERATE_REFUND_MESSAGE_INPUT_SHAPE = {
  case_type          : z.enum(CASE_TYPES).describe("Case type from the playbook (TH1 to TH7)"),
  customer_name      : z.string().describe("Customer first name to address in the greeting"),
  plan_name          : z.string().describe("Plan name shown in the refund breakdown (e.g. 5-slot)"),
  charge_amount      : z.number().describe("Charge per cycle in USD"),
  refund_amount      : z.number().describe("Final refund amount in USD (output of calculate_refund)"),
  deduction_percent  : z.number().min(0).max(100).describe("Deduction percent already applied"),
  cycles             : z
    .array(z.object(CYCLE_INPUT_SHAPE))
    .describe("Cycles covered by the refund, oldest first"),
  include_winback    : z
    .boolean()
    .default(true)
    .describe("Whether to prepend the win-back offer before the refund breakdown"),
  is_angry           : z
    .boolean()
    .default(false)
    .describe("Whether to use the empathetic opening for angry customers"),
  bill_status        : z
    .enum(["paid", "upcoming"])
    .describe("Current bill status. TH4 appends the two-option block when Upcoming."),
} satisfies ZodRawShape;

/**************************************************************************
 * OUTPUT
 ***************************************************************************/

const GENERATE_REFUND_MESSAGE_OUTPUT_SHAPE = {
  message : z
    .string()
    .describe("Draft reply ready to be sent to the customer (review before sending)"),
  needs_customer_confirm : z
    .boolean()
    .describe("True when the agent should wait for the customer to confirm the amount before issuing the refund"),
  needs_manager_approve : z
    .boolean()
    .describe("True when the refund must be approved by Manager (Boo) before being processed"),
} satisfies ZodRawShape;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { GENERATE_REFUND_MESSAGE_INPUT_SHAPE, GENERATE_REFUND_MESSAGE_OUTPUT_SHAPE };

export type GenerateRefundMessageInput  = z.infer<z.ZodObject<typeof GENERATE_REFUND_MESSAGE_INPUT_SHAPE>>;
export type GenerateRefundMessageOutput = z.infer<z.ZodObject<typeof GENERATE_REFUND_MESSAGE_OUTPUT_SHAPE>>;
