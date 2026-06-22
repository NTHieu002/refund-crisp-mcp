/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";
import type { ZodRawShape } from "zod";

/**************************************************************************
 * INPUT
 ***************************************************************************/

const CALCULATE_REFUND_INPUT_SHAPE = {
  charge_amount : z
    .number()
    .describe("Charge per cycle in USD (e.g. 24.00 for a 5-slot plan)"),
  cycle_start : z
    .string()
    .describe("Current cycle start date in ISO format (UTC)"),
  cancel_date : z
    .string()
    .describe(
      "Cancellation or refund reference date in ISO format. For multi-cycle refunds, this is the date the customer stopped using the app.",
    ),
  deduction_percent : z
    .number()
    .min(0)
    .max(100)
    .default(20)
    .describe(
      "Deduction applied to the prorated amount. Typical values: 0 (full refund — honored commitment, PageFly fault, trial, returning customer), 10 (split Shopify fees equally — yearly plan or customer pushed back on 20%), 20 (default: 15% Shopify fee + 5% maintenance), 40 (refund of 3+ unused cycles).",
    ),
  num_cycles : z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe(
      "Number of cycles to refund. 1 means prorated refund of the current cycle. 2+ means full refund of past cycles minus the deduction.",
    ),
  has_billing_invoice : z
    .boolean()
    .describe(
      "Required. Pass true only if the customer has already shared their Shopify billing invoice (screenshot or PDF). Pass false otherwise — the tool will refuse to compute and instruct you to collect it first.",
    ),
  has_bank_confirmation : z
    .boolean()
    .describe(
      "Required. Pass true only if the customer has already confirmed their bank account / payment method for the refund. Pass false otherwise — the tool will refuse.",
    ),
  verified_downgrade_complete : z
    .boolean()
    .describe(
      "Required. Pass true ONLY if you have verified via check_subscription that the customer's current plan is 'free' OR status is 'uninstalled' / 'cancelled'. Do NOT trust the customer's verbal claim (e.g. 'I just downgraded'). If check_subscription still reports a paid plan with status 'active', pass false — the tool will refuse and instruct you to ask the customer to downgrade first. NOTE: not required for a discount_adjustment (the customer keeps their plan).",
    ),
  already_refunded_amount : z
    .number()
    .min(0)
    .default(0)
    .describe(
      "Amount (USD) already refunded for this charge per the dashboard. Pass the dashboard value. If it is greater than 0 the tool refuses — Shopify or a colleague has already refunded this charge and a second refund would double-pay.",
    ),
  discount_adjustment : z
    .object({
      list_price_usd   : z.number().describe("The plan's normal list price per cycle in USD (before the promised discount)."),
      discount_percent : z.number().min(0).max(100).describe("The discount percent the customer was promised (verified via email proof)."),
    })
    .optional()
    .describe(
      "Set ONLY for a discount-commitment overcharge (the customer was promised a discount that was never applied). When present, the tool ignores proration and refunds the difference: charge_amount − list_price_usd × (1 − discount_percent/100). Always requires Manager verification of the email proof; the downgrade precondition is waived because the customer keeps their plan.",
    ),
} satisfies ZodRawShape;

/**************************************************************************
 * OUTPUT
 ***************************************************************************/

const CALCULATE_REFUND_OUTPUT_SHAPE = {
  charge_per_cycle    : z.number().describe("Charge per cycle in USD"),
  total_charge        : z.number().describe("Total charge across all refunded cycles"),
  days_used           : z.number().describe("Days already used in the current cycle (0 for multi-cycle refunds)"),
  days_unused         : z.number().describe("Days remaining in the current cycle (30 for multi-cycle refunds)"),
  prorated_amount     : z.number().describe("Refund amount before deduction, rounded to 2 decimals"),
  deduction_amount    : z.number().describe("Dollar amount deducted, rounded to 2 decimals"),
  deduction_reason    : z.string().describe("Human-readable explanation of why the deduction applies"),
  refund_amount       : z.number().describe("Final refund amount in USD, rounded to 2 decimals"),
  refund_per_cycle    : z.number().describe("Refund amount per cycle when splitting across multiple cycles"),
  formula_explanation : z.string().describe("One-line explanation of the formula used"),
} satisfies ZodRawShape;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { CALCULATE_REFUND_INPUT_SHAPE, CALCULATE_REFUND_OUTPUT_SHAPE };

export type CalculateRefundInput  = z.infer<z.ZodObject<typeof CALCULATE_REFUND_INPUT_SHAPE>>;
export type CalculateRefundOutput = z.infer<z.ZodObject<typeof CALCULATE_REFUND_OUTPUT_SHAPE>>;
