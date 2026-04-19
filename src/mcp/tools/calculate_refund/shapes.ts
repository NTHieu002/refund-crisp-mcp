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
      "Deduction applied to the prorated amount. Typical values: 0 (full refund, honored commitment), 20 (default: 15% Shopify fee + 5% maintenance), 40 (refund of many unused cycles).",
    ),
  num_cycles : z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe(
      "Number of cycles to refund. 1 means prorated refund of the current cycle. 2+ means full refund of past cycles minus the deduction.",
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
