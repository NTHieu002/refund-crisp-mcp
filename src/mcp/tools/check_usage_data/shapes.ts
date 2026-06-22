/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";
import type { ZodRawShape } from "zod";

/**************************************************************************
 * INPUT
 ***************************************************************************/

const CHECK_USAGE_DATA_INPUT_SHAPE = {
  store_url : z
    .string()
    .describe("Shopify store URL (any shape — it is normalized server-side)."),
  period_start : z
    .string()
    .optional()
    .describe("Optional ISO date. When set with period_end, only pages created/published/updated in this window count toward usage (usually the billed cycle)."),
  period_end : z
    .string()
    .optional()
    .describe("Optional ISO date. Upper bound of the usage window."),
} satisfies ZodRawShape;

/**************************************************************************
 * OUTPUT
 ***************************************************************************/

const USAGE_PAGE_SHAPE = {
  title          : z.string().describe("Page title"),
  created_date   : z.string().describe("Created date (ISO)"),
  published_date : z.string().nullable().describe("Published date (ISO), null if never published"),
  updated_date   : z.string().nullable().describe("Last-edited date (ISO), null if untouched"),
} satisfies ZodRawShape;

const CHECK_USAGE_DATA_OUTPUT_SHAPE = {
  found : z
    .boolean()
    .describe("Whether usage data could be retrieved for the store."),
  has_usage : z
    .boolean()
    .describe("True if the store published or recently updated pages in the window — evidence the app was actively used. NEVER true when data_source is 'unavailable'."),
  published_pages : z
    .array(z.object(USAGE_PAGE_SHAPE))
    .describe("Pages published in the window."),
  updated_pages : z
    .array(z.object(USAGE_PAGE_SHAPE))
    .describe("Pages edited in the window."),
  evidence_summary : z
    .string()
    .describe("One-line, customer-citable summary of the evidence (page titles + dates), or a note that no data is available."),
  data_source : z
    .enum(["fixture", "unavailable"])
    .describe("Where the data came from. 'unavailable' means usage could not be verified — do NOT treat absence of data as proof of non-use; fall back to cycle dates instead."),
  error : z
    .string()
    .nullable()
    .describe("Error message when the lookup fails, otherwise null."),
} satisfies ZodRawShape;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { CHECK_USAGE_DATA_INPUT_SHAPE, CHECK_USAGE_DATA_OUTPUT_SHAPE };

export type CheckUsageDataInput  = z.infer<z.ZodObject<typeof CHECK_USAGE_DATA_INPUT_SHAPE>>;
export type CheckUsageDataOutput = z.infer<z.ZodObject<typeof CHECK_USAGE_DATA_OUTPUT_SHAPE>>;
