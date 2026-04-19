/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { listCasesByStage } from "@/db/cases.js";

import type {
  ListPendingCasesInput,
  ListPendingCasesOutput,
} from "@/mcp/tools/list_pending_cases/shapes.js";

/**************************************************************************
 * HANDLER
 ***************************************************************************/

async function listPendingCasesHandler(
  input: ListPendingCasesInput,
): Promise<ListPendingCasesOutput> {
  try {
    const cases = await listCasesByStage(input.stage ?? null, input.limit);

    return {
      count : cases.length,
      cases : cases,
      error : null,
    };
  } catch (error) {
    return {
      count : 0,
      cases : [],
      error : error instanceof Error ? error.message : String(error),
    };
  }
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { listPendingCasesHandler };
