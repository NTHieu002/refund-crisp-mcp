/**************************************************************************
 * TYPES
 ***************************************************************************/

interface BillingCycle {
  store_url       : string;
  cycle_start     : string;
  cycle_end       : string;
  invoiced_date   : string;
  amount_usd      : number;
  earnings_usd    : number;
  refunded_amount : number;
  bill_status     : "paid" | "upcoming" | "failed";
}

/**************************************************************************
 * HELPERS
 ***************************************************************************/

const MS_DAY = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * MS_DAY).toISOString();
}

// Shopify deducts ~17.9% before passing earnings to the partner
// (15% transaction fee + Shopify processing). Earnings ≈ charge × 0.821
function earningsOf(charge: number): number {
  return Math.round(charge * 0.821 * 100) / 100;
}

/**************************************************************************
 * MOCKS
 ***************************************************************************/

// Test-only billing history: 3 paid cycles on the 5-slot plan ($24/cycle),
// with the most recent one just charged 10 days ago. Matches hieu-first-store
// in fixtures/stores.ts.
const BILLING_CYCLES_MOCK: BillingCycle[] = [
  // Oldest cycle — paid 70 days ago
  {
    store_url       : "hieu-first-store.myshopify.com",
    cycle_start     : daysFromNow(-70),
    cycle_end       : daysFromNow(-40),
    invoiced_date   : daysFromNow(-70),
    amount_usd      : 24.00,
    earnings_usd    : earningsOf(24.00),
    refunded_amount : 0,
    bill_status     : "paid",
  },
  // Middle cycle — paid 40 days ago
  {
    store_url       : "hieu-first-store.myshopify.com",
    cycle_start     : daysFromNow(-40),
    cycle_end       : daysFromNow(-10),
    invoiced_date   : daysFromNow(-40),
    amount_usd      : 24.00,
    earnings_usd    : earningsOf(24.00),
    refunded_amount : 0,
    bill_status     : "paid",
  },
  // Current cycle — paid 10 days ago, 20 days left
  {
    store_url       : "hieu-first-store.myshopify.com",
    cycle_start     : daysFromNow(-10),
    cycle_end       : daysFromNow(20),
    invoiced_date   : daysFromNow(-10),
    amount_usd      : 24.00,
    earnings_usd    : earningsOf(24.00),
    refunded_amount : 0,
    bill_status     : "paid",
  },
];

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { BILLING_CYCLES_MOCK };
