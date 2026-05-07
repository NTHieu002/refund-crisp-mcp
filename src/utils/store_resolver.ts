/**************************************************************************
 * STORE RESOLVER
 *
 * Resolves a customer-supplied store identifier (custom domain, admin URL,
 * bare handle, etc.) to the canonical "<handle>.myshopify.com".
 *
 * Strategy:
 *   1. Sync URL normalization (handles 90% of inputs)
 *   2. If input looks like a custom domain, fetch the storefront and
 *      regex `Shopify.shop = "..."` from the HTML
 *   3. Cache results for 3 days so repeat conversations don't re-fetch
 *
 * Skipped silently when the store is password-protected, returns non-2xx,
 * fetch times out (3s), or no Shopify.shop string is present in the HTML.
 ***************************************************************************/

import { normalizeStoreUrl } from "@/utils/store_url.js";

/**************************************************************************
 * CONSTANTS
 ***************************************************************************/

const CACHE_TTL_MS      = 3 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS  = 3_000;
const USER_AGENT        = "Mozilla/5.0 (compatible; pf-refund-mcp/1.0; +https://refund-mcp.pagefly.io)";
const SHOPIFY_SHOP_RE   = /Shopify\.shop\s*=\s*["']([a-z0-9-]+\.myshopify\.com)["']/i;
const DOMAIN_LIKE       = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/**************************************************************************
 * CACHE
 ***************************************************************************/

const cache = new Map<string, { handle: string | null; expiresAt: number }>();

function cacheGet(domain: string): string | null | undefined {
  const entry = cache.get(domain);

  if (!entry) return undefined;

  if (Date.now() > entry.expiresAt) {
    cache.delete(domain);
    return undefined;
  }

  return entry.handle;
}

function cacheSet(domain: string, handle: string | null): void {
  cache.set(domain, { handle, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**************************************************************************
 * STOREFRONT FETCH
 ***************************************************************************/

async function resolveDomainToHandle(domain: string): Promise<string | null> {
  const cached = cacheGet(domain);

  if (cached !== undefined) {
    console.log(`[store-resolver] ${domain} → ${cached ?? "null"} (cached)`);
    return cached;
  }

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`https://${domain}`, {
      headers  : { "User-Agent": USER_AGENT },
      signal   : controller.signal,
      redirect : "follow",
    });

    if (!res.ok) {
      console.log(`[store-resolver] ${domain} → HTTP ${res.status}, skipping`);
      cacheSet(domain, null);
      return null;
    }

    const html  = await res.text();
    const match = html.match(SHOPIFY_SHOP_RE);

    if (!match) {
      console.log(`[store-resolver] ${domain} → no Shopify.shop in HTML`);
      cacheSet(domain, null);
      return null;
    }

    const handle = match[1].toLowerCase();

    console.log(`[store-resolver] ${domain} → ${handle}`);
    cacheSet(domain, handle);

    return handle;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.log(`[store-resolver] ${domain} → fetch failed: ${message}`);
    cacheSet(domain, null);

    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**************************************************************************
 * PUBLIC API
 ***************************************************************************/

// Normalize first, then fall back to a storefront fetch when the input
// looks like a custom domain we haven't been able to canonicalize.
async function resolveStoreUrl(input: string | null | undefined): Promise<string | null> {
  const normalized = normalizeStoreUrl(input);

  if (normalized) return normalized;
  if (!input)     return null;

  const candidate = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^\/+/, "")
    .split(/[/?#]/, 1)[0];

  if (!DOMAIN_LIKE.test(candidate)) return null;
  if (candidate.endsWith(".myshopify.com")) return null;

  return resolveDomainToHandle(candidate);
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { resolveStoreUrl, resolveDomainToHandle };
