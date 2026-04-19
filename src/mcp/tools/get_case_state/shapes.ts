/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";
import type { ZodRawShape } from "zod";

import { CASE_RECORD_SHAPE } from "@/mcp/tools/_shared/case_shape.js";

/**************************************************************************
 * INPUT
 ***************************************************************************/

const GET_CASE_STATE_INPUT_SHAPE = {
  store_url : z.string().describe("Shopify store URL used to key the case record"),
} satisfies ZodRawShape;

/**************************************************************************
 * OUTPUT
 ***************************************************************************/

const GET_CASE_STATE_OUTPUT_SHAPE = {
  found : z.boolean().describe("Whether a stored case was found for the store URL"),
  case  : z.object(CASE_RECORD_SHAPE).nullable().describe("Full case row, or null when not found"),
  error : z.string().nullable().describe("Error message on DB failure, otherwise null"),
} satisfies ZodRawShape;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { GET_CASE_STATE_INPUT_SHAPE, GET_CASE_STATE_OUTPUT_SHAPE };

export type GetCaseStateInput  = z.infer<z.ZodObject<typeof GET_CASE_STATE_INPUT_SHAPE>>;
export type GetCaseStateOutput = z.infer<z.ZodObject<typeof GET_CASE_STATE_OUTPUT_SHAPE>>;
