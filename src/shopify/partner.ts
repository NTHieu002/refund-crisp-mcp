/**************************************************************************
 * TYPES
 ***************************************************************************/

interface PartnerStore {
  shop_domain    : string;
  pagefly_plan   : string | null;
  pagefly_price  : number | null;
  total_paid     : number;
  created_at     : string | null;
  uninstalled_at : string | null;
  email          : string | null;
  country        : string | null;
  shopify_plan   : string | null;
  status         : "installed" | "uninstalled" | null;
}

interface PartnerEvent {
  type        : string;
  gross       : number | null;
  net         : number | null;
  occurred_at : string;
}

interface PartnerResponse {
  store  : PartnerStore;
  events : PartnerEvent[];
}

/**************************************************************************
 * CACHE
 ***************************************************************************/

// In-memory TTL cache so check_subscription + get_billing_history back-to-back
// share a single webhook call (Hugo usually calls them sequentially).
const CACHE_TTL_MS = 60_000;

const cache = new Map<string, { data: PartnerResponse | null; expiresAt: number }>();

function cacheGet(storeUrl: string): PartnerResponse | null | undefined {
  const entry = cache.get(storeUrl);

  if (!entry) return undefined;

  if (Date.now() > entry.expiresAt) {
    cache.delete(storeUrl);
    return undefined;
  }

  return entry.data;
}

function cacheSet(storeUrl: string, data: PartnerResponse | null): void {
  cache.set(storeUrl, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**************************************************************************
 * CLIENT
 ***************************************************************************/

// Returns null when the store is not found or n8n credentials are missing.
// Throws on network / HTTP / auth errors so callers can surface a real problem.
async function fetchPartnerData(storeUrl: string): Promise<PartnerResponse | null> {
  const cached = cacheGet(storeUrl);

  if (cached !== undefined) return cached;

  const webhook = process.env.N8N_WEBHOOK_URL;
  const apiKey  = process.env.N8N_API_KEY;

  if (!webhook || !apiKey) {
    // Not configured — caller should fall back to local fixtures (dev mode)
    return null;
  }

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(webhook, {
      method  : "POST",
      headers : {
        "X-API-Key"    : apiKey,
        "Content-Type" : "application/json",
      },
      body    : JSON.stringify({ store_url: storeUrl }),
      signal  : controller.signal,
    });

    if (!res.ok) {
      throw new Error(
        `Partner webhook failed (${res.status}): ${await res.text()}`,
      );
    }

    const raw  = await res.json();
    const data = Array.isArray(raw) ? raw[0] : raw;

    // Store-not-found: n8n returns the shape with shop_domain missing / null
    if (!data?.store?.shop_domain) {
      cacheSet(storeUrl, null);
      return null;
    }

    const response = data as PartnerResponse;

    cacheSet(storeUrl, response);

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { fetchPartnerData };
export type { PartnerStore, PartnerEvent, PartnerResponse };
