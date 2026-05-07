/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { STORES_MOCK } from "@fixtures/stores.js";

import { fetchPartnerData } from "@/shopify/partner.js";
import { normalizeStoreUrl } from "@/utils/store_url.js";

import type {
  CheckSubscriptionInput,
  CheckSubscriptionOutput,
} from "@/mcp/tools/check_subscription/shapes.js";
import type { PartnerResponse } from "@/shopify/partner.js";

/**************************************************************************
 * HELPERS
 ***************************************************************************/

const MS_DAY = 24 * 60 * 60 * 1000;

// Sale events from Partner API land on the invoice date (sale_date + 1d).
// Back off by 1 day so cycle_start ≈ the day Shopify actually charged the shop.
function estimateCycleStart(saleOccurredAt: string): Date {
  return new Date(new Date(saleOccurredAt).getTime() - MS_DAY);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_DAY);
}

function latestEventByType(
  events : PartnerResponse["events"],
  type   : string,
): PartnerResponse["events"][number] | undefined {
  return events
    .filter((e) => e.type === type)
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())[0];
}

// Map Partner API events + store.status onto the enum our Zod shape exposes.
function inferStatus(
  store  : PartnerResponse["store"],
  events : PartnerResponse["events"],
): "active" | "cancelled" | "free" | "uninstalled" {
  if (store.status === "uninstalled") return "uninstalled";

  const lastActivated = latestEventByType(events, "SUBSCRIPTION_CHARGE_ACTIVATED");
  const lastCancelled = latestEventByType(events, "SUBSCRIPTION_CHARGE_CANCELED");

  if (lastCancelled && (!lastActivated || lastCancelled.occurred_at > lastActivated.occurred_at)) {
    return "cancelled";
  }

  if (lastActivated) return "active";

  // Installed but never subscribed → free plan
  return "free";
}

function humanNameFromEmail(email: string | null, storeUrl: string): string {
  if (email) {
    const local = email.split("@")[0];
    return local.charAt(0).toUpperCase() + local.slice(1);
  }

  return storeUrl.split(".")[0];
}

function mapPartnerToSubscription(
  data : PartnerResponse,
): CheckSubscriptionOutput["subscription"] {
  const { store, events } = data;

  const status       = inferStatus(store, events);
  const lastSale     = latestEventByType(events, "AppSubscriptionSale");
  const firstInstall = [...events]
    .filter((e) => e.type === "RELATIONSHIP_INSTALLED" || e.type === "SUBSCRIPTION_CHARGE_ACTIVATED")
    .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime())[0];

  const cycleStart = lastSale
    ? estimateCycleStart(lastSale.occurred_at)
    : new Date(store.created_at ?? Date.now());
  const cycleEnd = addDays(cycleStart, 30);

  const cancelledEvent = latestEventByType(events, "SUBSCRIPTION_CHARGE_CANCELED");

  return {
    subscription_id     : store.shop_domain,
    store_url           : store.shop_domain,
    store_name          : store.shop_domain.split(".")[0],
    customer_email      : store.email ?? `unknown@${store.shop_domain}`,
    customer_name       : humanNameFromEmail(store.email, store.shop_domain),
    plan                : store.pagefly_plan ?? "free",
    price_usd           : store.pagefly_price ?? 0,
    status,
    activated_date      : firstInstall?.occurred_at ?? store.created_at ?? new Date().toISOString(),
    cancelled_date      : status === "cancelled" ? cancelledEvent?.occurred_at ?? null : null,
    current_cycle_start : cycleStart.toISOString(),
    current_cycle_end   : cycleEnd.toISOString(),
    is_installed        : store.status === "installed",
    slots_used          : 0,
  };
}

/**************************************************************************
 * HANDLER
 ***************************************************************************/

async function checkSubscriptionHandler(
  input : CheckSubscriptionInput,
): Promise<CheckSubscriptionOutput> {
  if (!input.store_url && !input.email) {
    return {
      found        : false,
      subscription : null,
      error        : "Either store_url or email must be provided.",
    };
  }

  // Normalize various URL shapes into the canonical <handle>.myshopify.com form
  // (admin.shopify.com/store/<handle>, https://<handle>.myshopify.com/admin,
  // bare handles like "hieu-first-store", etc.).
  const normalized = input.store_url ? normalizeStoreUrl(input.store_url) : null;

  if (input.store_url && !normalized) {
    return {
      found        : false,
      subscription : null,
      error        :
        `Could not parse "${input.store_url}" as a Shopify store URL. ` +
        `Ask the customer for their .myshopify.com URL — it is the URL ` +
        `shown in Shopify Admin → top-left store name (looks like ` +
        `"<store-name>.myshopify.com"). A custom domain such as mybrand.com ` +
        `cannot be used here.`,
    };
  }

  // Partner API lookup requires store_url. Email-only falls back to fixtures.
  if (normalized) {
    const partner = await fetchPartnerData(normalized);

    if (partner) {
      return {
        found        : true,
        subscription : mapPartnerToSubscription(partner),
        error        : null,
      };
    }

    // Partner returned null — either store not found OR n8n not configured.
    // Try fixtures before giving up (lets dev work offline).
  }

  const needle = (normalized ?? "").toLowerCase();

  const match = STORES_MOCK.find((store) => {
    if (input.store_url && store.store_url.toLowerCase() === needle) return true;
    if (input.email && store.customer_email.toLowerCase() === input.email.toLowerCase()) return true;
    return false;
  }) ?? null;

  return {
    found        : match !== null,
    subscription : match,
    error        : null,
  };
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { checkSubscriptionHandler };
