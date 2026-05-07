/**************************************************************************
 * STORE URL NORMALIZATION
 *
 * Customers send their Shopify store identifier in many shapes. Normalize
 * everything to the canonical "<handle>.myshopify.com" before hitting the
 * Partner API or the case DB.
 *
 * Returns null when the input cannot be resolved to a myshopify handle —
 * the caller should ask the customer for their .myshopify.com URL.
 ***************************************************************************/

const STORE_HANDLE = /^[a-z0-9][a-z0-9-]{0,59}$/;

function normalizeStoreUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let value = raw.trim().toLowerCase();
  if (!value) return null;

  // Strip protocol + leading slashes if present
  value = value.replace(/^https?:\/\//, "").replace(/^\/+/, "");

  // Drop trailing path / query / fragment / trailing slash
  value = value.split(/[/?#]/, 1)[0];

  // Already canonical form: <handle>.myshopify.com
  const myshopify = value.match(/^([a-z0-9][a-z0-9-]{0,59})\.myshopify\.com$/);
  if (myshopify) {
    return `${myshopify[1]}.myshopify.com`;
  }

  // Admin URL after path was stripped already wouldn't reach here with
  // a useful handle. Re-parse the original raw value for admin paths.
  const adminMatch = raw
    .toLowerCase()
    .match(/admin\.shopify\.com\/store\/([a-z0-9][a-z0-9-]{0,59})/);
  if (adminMatch) {
    return `${adminMatch[1]}.myshopify.com`;
  }

  // Bare handle ("hieu-first-store") — assume customer dropped the suffix
  if (STORE_HANDLE.test(value)) {
    return `${value}.myshopify.com`;
  }

  // Custom domain (e.g. mybrand.com) — Partner API needs the myshopify
  // handle, can't auto-resolve.
  return null;
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { normalizeStoreUrl };
