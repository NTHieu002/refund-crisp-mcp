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

// Build N consecutive 30-day paid cycles ending `endsDaysAgo` days ago
function buildPaidHistory(
  store_url : string,
  charge    : number,
  cycles    : number,
  endsDaysAgo : number,
): BillingCycle[] {
  const history: BillingCycle[] = [];

  for (let i = 0; i < cycles; i++) {
    const cycleIndexFromLatest = cycles - 1 - i;
    const cycleEndOffset       = -endsDaysAgo - cycleIndexFromLatest * 30;
    const cycleStartOffset     = cycleEndOffset - 30;

    history.push({
      store_url       : store_url,
      cycle_start     : daysFromNow(cycleStartOffset),
      cycle_end       : daysFromNow(cycleEndOffset),
      invoiced_date   : daysFromNow(cycleEndOffset),
      amount_usd      : charge,
      earnings_usd    : earningsOf(charge),
      refunded_amount : 0,
      bill_status     : "paid",
    });
  }

  return history;
}

/**************************************************************************
 * MOCKS
 ***************************************************************************/

const BILLING_CYCLES_MOCK: BillingCycle[] = [
  // Snow & Whitee — 9 paid cycles, customer has not used the app for months
  ...buildPaidHistory("snowandwhitee.myshopify.com", 62.40, 9, 10),

  // Delinio — single paid cycle just renewed, then customer cancelled
  {
    store_url       : "delinio.myshopify.com",
    cycle_start     : daysFromNow(-2),
    cycle_end       : daysFromNow(28),
    invoiced_date   : daysFromNow(-2),
    amount_usd      : 24.00,
    earnings_usd    : earningsOf(24.00),
    refunded_amount : 0,
    bill_status     : "paid",
  },

  // Petcores — one paid cycle, uninstalled 19 days in
  {
    store_url       : "16fa50-2.myshopify.com",
    cycle_start     : daysFromNow(-19),
    cycle_end       : daysFromNow(11),
    invoiced_date   : daysFromNow(-19),
    amount_usd      : 29.00,
    earnings_usd    : earningsOf(29.00),
    refunded_amount : 0,
    bill_status     : "paid",
  },

  // Zivy — activated and cancelled same day, bill already paid
  {
    store_url       : "tiendaconexionsoftware10.myshopify.com",
    cycle_start     : daysFromNow(-30),
    cycle_end       : daysFromNow(0),
    invoiced_date   : daysFromNow(-30),
    amount_usd      : 24.00,
    earnings_usd    : earningsOf(24.00),
    refunded_amount : 0,
    bill_status     : "paid",
  },

  // Hardvoro — switched plan mid-cycle, two charges on the same bill
  {
    store_url       : "hardvoro.myshopify.com",
    cycle_start     : daysFromNow(-30),
    cycle_end       : daysFromNow(-5),
    invoiced_date   : daysFromNow(-5),
    amount_usd      : 13.50,
    earnings_usd    : earningsOf(13.50),
    refunded_amount : 0,
    bill_status     : "paid",
  },
  {
    store_url       : "hardvoro.myshopify.com",
    cycle_start     : daysFromNow(-5),
    cycle_end       : daysFromNow(25),
    invoiced_date   : daysFromNow(-5),
    amount_usd      : 82.50,
    earnings_usd    : earningsOf(82.50),
    refunded_amount : 0,
    bill_status     : "paid",
  },

  // AEROWEAR — latest cycle still Upcoming (TH4 scenario)
  ...buildPaidHistory("aerowear.myshopify.com", 49.00, 3, 36),
  {
    store_url       : "aerowear.myshopify.com",
    cycle_start     : daysFromNow(-6),
    cycle_end       : daysFromNow(24),
    invoiced_date   : daysFromNow(24),
    amount_usd      : 49.00,
    earnings_usd    : earningsOf(49.00),
    refunded_amount : 0,
    bill_status     : "upcoming",
  },

  // Delores Art Canada — unauthorized upgrade to Unlimited (TH5)
  {
    store_url       : "deloresartcanada.myshopify.com",
    cycle_start     : daysFromNow(-42),
    cycle_end       : daysFromNow(-12),
    invoiced_date   : daysFromNow(-12),
    amount_usd      : 99.00,
    earnings_usd    : earningsOf(99.00),
    refunded_amount : 0,
    bill_status     : "paid",
  },
  {
    store_url       : "deloresartcanada.myshopify.com",
    cycle_start     : daysFromNow(-12),
    cycle_end       : daysFromNow(18),
    invoiced_date   : daysFromNow(-12),
    amount_usd      : 99.00,
    earnings_usd    : earningsOf(99.00),
    refunded_amount : 0,
    bill_status     : "paid",
  },
];

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { BILLING_CYCLES_MOCK };
