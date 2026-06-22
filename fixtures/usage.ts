/**************************************************************************
 * TYPES
 ***************************************************************************/

interface UsagePage {
  title          : string;
  created_date   : string;        // ISO (UTC)
  published_date : string | null; // ISO (UTC), null if never published
  updated_date   : string | null; // ISO (UTC) of the last edit, null if untouched
}

interface StoreUsage {
  store_url       : string;
  published_pages : UsagePage[];
  updated_pages   : UsagePage[];
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

// Test-only mock: the dev store has been actively used inside the current cycle
// (2 pages published, 1 edited in the last ~3 weeks). Gives Hugo a realistic
// "customer says they never used it, but the data disagrees → TH8 decline".
const USAGE_MOCK: StoreUsage[] = [
  {
    store_url       : "hieu-first-store.myshopify.com",
    published_pages : [
      { title: "Home v2",        created_date: daysFromNow(-25), published_date: daysFromNow(-24), updated_date: daysFromNow(-5) },
      { title: "Black Friday",   created_date: daysFromNow(-18), published_date: daysFromNow(-17), updated_date: null },
    ],
    updated_pages   : [
      { title: "Product — Tee",  created_date: daysFromNow(-60), published_date: daysFromNow(-58), updated_date: daysFromNow(-3) },
    ],
  },
];

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { USAGE_MOCK };
export type { UsagePage, StoreUsage };
