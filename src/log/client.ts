/**************************************************************************
 * LOG CLIENT
 *
 * Fire-and-forget HTTP client for the "refund case log" webhook. The webhook
 * is expected to point at an n8n flow that appends / upserts a row into a
 * Google Sheet (or any other store) for ops visibility.
 *
 * Skipped silently when N8N_LOG_WEBHOOK_URL is missing so dev and other
 * deployments that don't care about sheet logging keep working.
 ***************************************************************************/

async function logRefundCase(snapshot: Record<string, unknown>): Promise<void> {
  const url = process.env.N8N_LOG_WEBHOOK_URL;
  const key = process.env.N8N_API_KEY;

  if (!url || !key) return;

  try {
    await fetch(url, {
      method  : "POST",
      headers : {
        "X-API-Key"    : key,
        "Content-Type" : "application/json",
      },
      body    : JSON.stringify({
        ...snapshot,
        logged_at : new Date().toISOString(),
      }),
      signal  : AbortSignal.timeout(10_000),
    });
  } catch (error) {
    // Fire-and-forget: never fail the parent save on a log miss.
    console.error("[log-case] webhook failed:", error instanceof Error ? error.message : error);
  }
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { logRefundCase };
