/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";
import type { ZodRawShape } from "zod";

/**************************************************************************
 * INPUT
 ***************************************************************************/

const GET_BILLING_HISTORY_INPUT_SHAPE = {
  store_url : z.string().describe("Shopify store URL (e.g. mystore.myshopify.com)"),
} satisfies ZodRawShape;

/**************************************************************************
 * OUTPUT
 ***************************************************************************/

const BILLING_CYCLE_SHAPE = {
  cycle_start     : z.string().describe("Cycle start date in ISO format (UTC)"),
  cycle_end       : z.string().describe("Cycle end date in ISO format (UTC)"),
  invoiced_date   : z.string().describe("Date the invoice was issued in ISO format (UTC)"),
  amount_usd      : z.number().describe("Charge amount in USD billed to the customer for this cycle"),
  earnings_usd    : z.number().describe("PageFly earnings after Shopify fees (≈ 82% of amount)"),
  refunded_amount : z.number().describe("Amount already refunded for this cycle in USD"),
  bill_status     : z.enum(["paid", "upcoming", "failed"]).describe("Status of the bill"),
} satisfies ZodRawShape;

const GET_BILLING_HISTORY_OUTPUT_SHAPE = {
  found  : z.boolean().describe("Whether any billing cycle was found for the store"),
  cycles : z
    .array(z.object(BILLING_CYCLE_SHAPE))
    .describe("Billing cycles, ordered from oldest to newest"),
} satisfies ZodRawShape;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { GET_BILLING_HISTORY_INPUT_SHAPE, GET_BILLING_HISTORY_OUTPUT_SHAPE };

export type GetBillingHistoryInput  = z.infer<z.ZodObject<typeof GET_BILLING_HISTORY_INPUT_SHAPE>>;
export type GetBillingHistoryOutput = z.infer<z.ZodObject<typeof GET_BILLING_HISTORY_OUTPUT_SHAPE>>;
