/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { USAGE_MOCK } from "@fixtures/usage.js";

import { resolveStoreUrl } from "@/utils/store_resolver.js";

import type {
  CheckUsageDataInput,
  CheckUsageDataOutput,
} from "@/mcp/tools/check_usage_data/shapes.js";
import type { StoreUsage, UsagePage } from "@fixtures/usage.js";

/**************************************************************************
 * HELPERS
 ***************************************************************************/

// Keep a page if any of its dates falls inside [start, end]. With no window,
// every page counts.
function inWindow(page: UsagePage, start: string | undefined, end: string | undefined): boolean {
  if (!start && !end) return true;

  const lo = start ? new Date(start).getTime() : -Infinity;
  const hi = end ? new Date(end).getTime() : Infinity;

  const stamps = [page.created_date, page.published_date, page.updated_date]
    .filter((d): d is string => d !== null)
    .map((d) => new Date(d).getTime());

  return stamps.some((t) => t >= lo && t <= hi);
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "—";
}

function summarize(published: UsagePage[], updated: UsagePage[]): string {
  const bits: string[] = [];

  for (const p of published) {
    bits.push(`published "${p.title}" on ${fmtDate(p.published_date ?? p.created_date)}`);
  }
  for (const p of updated) {
    bits.push(`edited "${p.title}" on ${fmtDate(p.updated_date)}`);
  }

  return bits.length > 0
    ? `Active use: ${bits.join("; ")}.`
    : "No published or recently edited pages in the window.";
}

/**************************************************************************
 * HANDLER
 ***************************************************************************/

// Look up evidence of active PageFly use (published / recently edited pages) so
// the agent can decide whether to decline (TH8) a "I never used it" claim.
//
// NOTE: the Shopify Partner API proxy does NOT expose page-level usage, so until
// a PageFly usage endpoint is wired this tool is fixture-backed. When no data is
// available it returns data_source: "unavailable" with has_usage: false — the
// agent must NOT read that as proof of non-use; fall back to cycle dates.
async function checkUsageDataHandler(
  input : CheckUsageDataInput,
): Promise<CheckUsageDataOutput> {
  const normalized = await resolveStoreUrl(input.store_url);
  const needle     = (normalized ?? input.store_url).toLowerCase();

  const match: StoreUsage | undefined = USAGE_MOCK.find(
    (store) => store.store_url.toLowerCase() === needle,
  );

  if (!match) {
    return {
      found            : false,
      has_usage        : false,
      published_pages  : [],
      updated_pages    : [],
      evidence_summary :
        "No usage data available for this store (the page-usage source is not wired up). " +
        "Do NOT treat this as proof the customer didn't use the app — decide from the cycle dates instead.",
      data_source      : "unavailable",
      error            : null,
    };
  }

  const published = match.published_pages.filter((p) => inWindow(p, input.period_start, input.period_end));
  const updated   = match.updated_pages.filter((p) => inWindow(p, input.period_start, input.period_end));

  return {
    found            : true,
    has_usage        : published.length > 0 || updated.length > 0,
    published_pages  : published,
    updated_pages    : updated,
    evidence_summary : summarize(published, updated),
    data_source      : "fixture",
    error            : null,
  };
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { checkUsageDataHandler };
