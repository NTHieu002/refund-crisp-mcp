/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";
import type { ZodRawShape } from "zod";

/**************************************************************************
 * INPUT
 ***************************************************************************/

const CHECK_SUBSCRIPTION_INPUT_SHAPE = {
  store_url : z
    .string()
    .optional()
    .describe("Shopify store URL (e.g. mystore.myshopify.com)"),
  email : z
    .email()
    .optional()
    .describe("Customer email attached to the store"),
} satisfies ZodRawShape;

/**************************************************************************
 * OUTPUT
 ***************************************************************************/

const SUBSCRIPTION_SHAPE = {
  subscription_id     : z.string().describe("Internal subscription ID (e.g. SUB_001)"),
  store_url           : z.string().describe("Shopify store URL"),
  store_name          : z.string().describe("Store display name"),
  customer_email      : z.email().describe("Customer email"),
  customer_name       : z.string().describe("Customer name"),
  plan                : z.string().describe("Current PageFly plan (e.g. 5-slot, Unlimited Monthly)"),
  price_usd           : z.number().describe("Monthly charge in USD for the current plan"),
  status              : z
    .enum(["active", "cancelled", "free", "uninstalled"])
    .describe("Current subscription status"),
  activated_date      : z.string().describe("Subscription activation date in ISO format (UTC)"),
  cancelled_date      : z.string().nullable().describe("Cancellation date in ISO format, null if still active"),
  current_cycle_start : z.string().describe("Start of the current 30-day billing cycle (ISO)"),
  current_cycle_end   : z.string().describe("End of the current 30-day billing cycle (ISO)"),
  is_installed        : z.boolean().describe("Whether the app is still installed on the store"),
  slots_used          : z.number().describe("Number of published pages/sections currently using a slot"),
} satisfies ZodRawShape;

const CHECK_SUBSCRIPTION_OUTPUT_SHAPE = {
  found        : z.boolean().describe("Whether a subscription was found for the provided identifier"),
  subscription : z.object(SUBSCRIPTION_SHAPE).nullable().describe("Subscription details"),
  error        : z.string().nullable().describe("Error message when input is invalid, otherwise null"),
} satisfies ZodRawShape;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { CHECK_SUBSCRIPTION_INPUT_SHAPE, CHECK_SUBSCRIPTION_OUTPUT_SHAPE };

export type CheckSubscriptionInput  = z.infer<z.ZodObject<typeof CHECK_SUBSCRIPTION_INPUT_SHAPE>>;
export type CheckSubscriptionOutput = z.infer<z.ZodObject<typeof CHECK_SUBSCRIPTION_OUTPUT_SHAPE>>;
