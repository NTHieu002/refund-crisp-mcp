/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { getCase } from "@/db/cases.js";

import type {
  GetCaseStateInput,
  GetCaseStateOutput,
} from "@/mcp/tools/get_case_state/shapes.js";

/**************************************************************************
 * HANDLER
 ***************************************************************************/

async function getCaseStateHandler(
  input: GetCaseStateInput,
): Promise<GetCaseStateOutput> {
  try {
    const record = await getCase(input.store_url);

    return {
      found : record !== null,
      case  : record,
      error : null,
    };
  } catch (error) {
    return {
      found : false,
      case  : null,
      error : error instanceof Error ? error.message : String(error),
    };
  }
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { getCaseStateHandler };
