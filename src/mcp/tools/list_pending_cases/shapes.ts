/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";
import type { ZodRawShape } from "zod";

import { CASE_RECORD_SHAPE } from "@/mcp/tools/_shared/case_shape.js";

/**************************************************************************
 * CONSTANTS
 ***************************************************************************/

const STAGE_VALUES = [
  "collecting_info",
  "winback_offered",
  "awaiting_customer_confirm",
  "awaiting_manager",
  "awaiting_bill_paid",
  "awaiting_option_choice",
  "refund_issued",
  "completed",
  "rejected",
  "abandoned",
] as const;

/**************************************************************************
 * INPUT
 ***************************************************************************/

const LIST_PENDING_CASES_INPUT_SHAPE = {
  stage : z
    .enum(STAGE_VALUES)
    .optional()
    .describe("Filter by case stage. Omit to list all cases across every stage."),
  limit : z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .describe("Maximum number of cases to return (most recently updated first)."),
} satisfies ZodRawShape;

/**************************************************************************
 * OUTPUT
 ***************************************************************************/

const LIST_PENDING_CASES_OUTPUT_SHAPE = {
  count : z.number().describe("Number of cases returned"),
  cases : z.array(z.object(CASE_RECORD_SHAPE)).describe("Cases ordered by most recent update first"),
  error : z.string().nullable().describe("Error message on DB failure, otherwise null"),
} satisfies ZodRawShape;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { LIST_PENDING_CASES_INPUT_SHAPE, LIST_PENDING_CASES_OUTPUT_SHAPE };

export type ListPendingCasesInput  = z.infer<z.ZodObject<typeof LIST_PENDING_CASES_INPUT_SHAPE>>;
export type ListPendingCasesOutput = z.infer<z.ZodObject<typeof LIST_PENDING_CASES_OUTPUT_SHAPE>>;
