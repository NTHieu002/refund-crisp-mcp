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

// Mock PageFly subscriptions inspired by real refund cases from the knowledge base
const STORES_MOCK: Subscription[] = [
  {
    subscription_id     : "SUB_001",
    store_url           : "snowandwhitee.myshopify.com",
    store_name          : "Snow & Whitee",
    customer_email      : "xiaolan@snowandwhitee.com",
    customer_name       : "Xiaolan",
    plan                : "10-slot",
    price_usd           : 62.40,
    status              : "active",
    activated_date      : daysFromNow(-280),
    cancelled_date      : null,
    current_cycle_start : daysFromNow(-10),
    current_cycle_end   : daysFromNow(20),
    is_installed        : true,
    slots_used          : 2,
  },
  {
    subscription_id     : "SUB_002",
    store_url           : "delinio.myshopify.com",
    store_name          : "Delinio",
    customer_email      : "vyron@delinio.com",
    customer_name       : "Vyron",
    plan                : "5-slot",
    price_usd           : 24.00,
    status              : "cancelled",
    activated_date      : daysFromNow(-88),
    cancelled_date      : daysFromNow(-1),
    current_cycle_start : daysFromNow(-2),
    current_cycle_end   : daysFromNow(28),
    is_installed        : true,
    slots_used          : 0,
  },
  {
    subscription_id     : "SUB_003",
    store_url           : "16fa50-2.myshopify.com",
    store_name          : "Petcores",
    customer_email      : "owner@petcores.com",
    customer_name       : "Petcores",
    plan                : "10-slot",
    price_usd           : 29.00,
    status              : "uninstalled",
    activated_date      : daysFromNow(-29),
    cancelled_date      : daysFromNow(-1),
    current_cycle_start : daysFromNow(-19),
    current_cycle_end   : daysFromNow(11),
    is_installed        : false,
    slots_used          : 0,
  },
  {
    subscription_id     : "SUB_004",
    store_url           : "tiendaconexionsoftware10.myshopify.com",
    store_name          : "Zivy",
    customer_email      : "admin@zivy.es",
    customer_name       : "Zivy Admin",
    plan                : "5-slot",
    price_usd           : 24.00,
    status              : "cancelled",
    activated_date      : daysFromNow(-30),
    cancelled_date      : daysFromNow(-30),
    current_cycle_start : daysFromNow(-30),
    current_cycle_end   : daysFromNow(0),
    is_installed        : true,
    slots_used          : 0,
  },
  {
    subscription_id     : "SUB_005",
    store_url           : "hardvoro.myshopify.com",
    store_name          : "Hardvoro",
    customer_email      : "ops@hardvoro.com",
    customer_name       : "Hardvoro Ops",
    plan                : "Unlimited Monthly",
    price_usd           : 99.00,
    status              : "active",
    activated_date      : daysFromNow(-5),
    cancelled_date      : null,
    current_cycle_start : daysFromNow(-5),
    current_cycle_end   : daysFromNow(25),
    is_installed        : true,
    slots_used          : 12,
  },
  {
    subscription_id     : "SUB_006",
    store_url           : "aerowear.myshopify.com",
    store_name          : "AEROWEAR",
    customer_email      : "hi@aerowear.com",
    customer_name       : "Aero Team",
    plan                : "30-slot",
    price_usd           : 49.00,
    status              : "cancelled",
    activated_date      : daysFromNow(-120),
    cancelled_date      : daysFromNow(-6),
    current_cycle_start : daysFromNow(-6),
    current_cycle_end   : daysFromNow(24),
    is_installed        : true,
    slots_used          : 0,
  },
  {
    subscription_id     : "SUB_007",
    store_url           : "deloresartcanada.myshopify.com",
    store_name          : "Delores Art Canada",
    customer_email      : "delores@deloresartcanada.com",
    customer_name       : "Delores",
    plan                : "Pay As You Go",
    price_usd           : 0,
    status              : "active",
    activated_date      : daysFromNow(-400),
    cancelled_date      : null,
    current_cycle_start : daysFromNow(-12),
    current_cycle_end   : daysFromNow(18),
    is_installed        : true,
    slots_used          : 1,
  },
];

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { STORES_MOCK };
