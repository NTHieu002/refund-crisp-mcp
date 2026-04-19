/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { BILLING_CYCLES_MOCK } from "@fixtures/billing_cycles.js";

import type {
  GetBillingHistoryInput,
  GetBillingHistoryOutput,
} from "@/mcp/tools/get_billing_history/shapes.js";

/**************************************************************************
 * HANDLER
 ***************************************************************************/

function getBillingHistoryHandler(
  input: GetBillingHistoryInput,
): GetBillingHistoryOutput {
  const needle = input.store_url.toLowerCase();

  const matches = BILLING_CYCLES_MOCK
    .filter((cycle) => cycle.store_url.toLowerCase() === needle)
    .map((cycle) => ({
      cycle_start     : cycle.cycle_start,
      cycle_end       : cycle.cycle_end,
      invoiced_date   : cycle.invoiced_date,
      amount_usd      : cycle.amount_usd,
      earnings_usd    : cycle.earnings_usd,
      refunded_amount : cycle.refunded_amount,
      bill_status     : cycle.bill_status,
    }))
    .sort((a, b) => new Date(a.cycle_start).getTime() - new Date(b.cycle_start).getTime());

  return {
    found  : matches.length > 0,
    cycles : matches,
  };
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { getBillingHistoryHandler };
