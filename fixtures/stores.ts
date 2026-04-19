/**************************************************************************
 * TYPES
 ***************************************************************************/

interface Subscription {
  subscription_id     : string;
  store_url           : string;
  store_name          : string;
  customer_email      : string;
  customer_name       : string;
  plan                : string;
  price_usd           : number;
  status              : "active" | "cancelled" | "free" | "uninstalled";
  activated_date      : string;
  cancelled_date      : string | null;
  current_cycle_start : string;
  current_cycle_end   : string;
  is_installed        : boolean;
  slots_used          : number;
}

/**************************************************************************
 * DATE HELPER
 ***************************************************************************/

const MS_DAY = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * MS_DAY).toISOString();
}

/**************************************************************************
 * MOCKS
 ***************************************************************************/

// Test-only mock: a single Shopify dev store on a 5-slot plan, currently 10
// days into a new 30-day cycle. Gives Hugo a realistic TH1 prorated-refund
// scenario to reason through.
const STORES_MOCK: Subscription[] = [
  {
    subscription_id     : "SUB_TEST_001",
    store_url           : "hieu-first-store.myshopify.com",
    store_name          : "Hieu First Store",
    customer_email      : "hieu@hieu-first-store.com",
    customer_name       : "Hieu",
    plan                : "5-slot",
    price_usd           : 24.00,
    status              : "active",
    activated_date      : daysFromNow(-90),
    cancelled_date      : null,
    current_cycle_start : daysFromNow(-10),
    current_cycle_end   : daysFromNow(20),
    is_installed        : true,
    slots_used          : 2,
  },
];

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { STORES_MOCK };
