/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { BILLING_CYCLES_MOCK } from "@fixtures/billing_cycles.js";

import { fetchPartnerData } from "@/shopify/partner.js";
import { normalizeStoreUrl } from "@/utils/store_url.js";

import type {
  GetBillingHistoryInput,
  GetBillingHistoryOutput,
} from "@/mcp/tools/get_billing_history/shapes.js";
import type { PartnerEvent, PartnerResponse } from "@/shopify/partner.js";

/**************************************************************************
 * HELPERS
 ***************************************************************************/

const MS_DAY                = 24 * 60 * 60 * 1000;
const SHOPIFY_PAYOUT_RATIO  = 0.821;  // Rough fallback — 80% revshare + ~2% processing

function mapSaleToCycle(
  event       : PartnerEvent,
  planPrice   : number | null,
): GetBillingHistoryOutput["cycles"][number] {
  const invoiced  = new Date(event.occurred_at);
  const cycleStart = new Date(invoiced.getTime() - MS_DAY);
  const cycleEnd   = new Date(cycleStart.getTime() + 30 * MS_DAY);

  // Gross (what the customer paid) — prefer event.gross if present, else fall
  // back to the store's current plan price, else reverse-calc from net.
  const gross = event.gross
    ?? planPrice
    ?? (event.net !== null ? Number((event.net / SHOPIFY_PAYOUT_RATIO).toFixed(2)) : 0);

  const earnings = event.net ?? Number((gross * SHOPIFY_PAYOUT_RATIO).toFixed(2));

  return {
    cycle_start     : cycleStart.toISOString(),
    cycle_end       : cycleEnd.toISOString(),
    invoiced_date   : event.occurred_at,
    amount_usd      : gross,
    earnings_usd    : earnings,
    refunded_amount : 0,
    bill_status     : "paid",
  };
}

function mapPartnerToCycles(
  data : PartnerResponse,
): GetBillingHistoryOutput["cycles"] {
  return data.events
    .filter((e) => e.type === "AppSubscriptionSale")
    .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime())
    .map((e) => mapSaleToCycle(e, data.store.pagefly_price));
}

/**************************************************************************
 * HANDLER
 ***************************************************************************/

async function getBillingHistoryHandler(
  input : GetBillingHistoryInput,
): Promise<GetBillingHistoryOutput> {
  const normalized = normalizeStoreUrl(input.store_url);

  if (!normalized) {
    return {
      found  : false,
      cycles : [],
    };
  }

  const partner = await fetchPartnerData(normalized);

  if (partner) {
    return {
      found  : true,
      cycles : mapPartnerToCycles(partner),
    };
  }

  const needle = normalized.toLowerCase();

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
