/**************************************************************************
 * TYPES
 ***************************************************************************/

interface CrispMetaResponse {
  error  : boolean;
  reason : string;
  data   : {
    segments? : string[];
    [key: string]: unknown;
  };
}

// Headers Crisp signs onto every MCP request. The session/website here are the
// AUTHORITATIVE source — the upstream agent (Hugo) routinely hallucinates the
// crisp_session_id tool argument, so we always prefer these over tool input.
interface CrispContext {
  sessionId : string | null;  // full "session_<uuid>" form, ready for the API
  websiteId : string | null;  // website the conversation belongs to
}

type IncomingHeaders = Record<string, string | string[] | undefined> | undefined;

/**************************************************************************
 * CONTEXT
 ***************************************************************************/

function headerValue(headers: IncomingHeaders, name: string): string | null {
  const raw = headers?.[name];
  const value = Array.isArray(raw) ? raw[0] : raw;

  return value && value.trim().length > 0 ? value.trim() : null;
}

// Crisp sends the session id as a bare UUID in "x-crisp-session-id"; the REST
// API expects the "session_" prefix, so re-attach it when missing.
function normalizeSessionId(raw: string | null): string | null {
  if (!raw) return null;

  return raw.startsWith("session_") ? raw : `session_${raw}`;
}

// Pull the Crisp conversation context out of the request headers that the
// MCP transport exposes via `extra.requestInfo.headers`.
function extractCrispContext(headers: IncomingHeaders): CrispContext {
  return {
    sessionId : normalizeSessionId(headerValue(headers, "x-crisp-session-id")),
    websiteId : headerValue(headers, "x-crisp-website-id"),
  };
}

// Operator-facing conversation link, e.g. used as the "Ticket ID" column in
// the ops sheet. Returns null when either part is missing.
function crispConversationUrl(
  websiteId : string | null,
  sessionId : string | null,
): string | null {
  return websiteId && sessionId
    ? `https://app.crisp.chat/website/${websiteId}/inbox/${sessionId}/`
    : null;
}

/**************************************************************************
 * HELPERS
 ***************************************************************************/

function crispAuthHeaders(): Record<string, string> {
  const identifier = process.env.CRISP_IDENTIFIER;
  const key        = process.env.CRISP_KEY;

  if (!identifier || !key) {
    throw new Error(
      "CRISP_IDENTIFIER and CRISP_KEY must be set to call the Crisp API.",
    );
  }

  const token = Buffer.from(`${identifier}:${key}`).toString("base64");

  return {
    "Authorization"  : `Basic ${token}`,
    "X-Crisp-Tier"   : "plugin",
    "Content-Type"   : "application/json",
  };
}

// Prefer the website id from the request header (the conversation's real
// website) and fall back to the configured CRISP_WEBSITE_ID for local/manual
// calls that have no header context.
function crispBaseUrl(websiteId?: string | null): string {
  const id = websiteId ?? process.env.CRISP_WEBSITE_ID;

  if (!id) {
    throw new Error("CRISP_WEBSITE_ID must be set to call the Crisp API.");
  }

  return `https://api.crisp.chat/v1/website/${id}`;
}

/**************************************************************************
 * API
 ***************************************************************************/

// Fetch current segments (tags) on a Crisp conversation
async function getConversationSegments(
  sessionId : string,
  websiteId? : string | null,
): Promise<string[]> {
  const url = `${crispBaseUrl(websiteId)}/conversation/${sessionId}/meta`;

  const res = await fetch(url, { headers: crispAuthHeaders() });

  if (!res.ok) {
    throw new Error(
      `Crisp GET conversation meta failed (${res.status}): ${await res.text()}`,
    );
  }

  const json = (await res.json()) as CrispMetaResponse;

  return json.data.segments ?? [];
}

// Replace the segments array on a Crisp conversation
async function setConversationSegments(
  sessionId : string,
  segments  : string[],
  websiteId? : string | null,
): Promise<void> {
  const url = `${crispBaseUrl(websiteId)}/conversation/${sessionId}/meta`;

  const res = await fetch(url, {
    method  : "PATCH",
    headers : crispAuthHeaders(),
    body    : JSON.stringify({ segments }),
  });

  if (!res.ok) {
    throw new Error(
      `Crisp PATCH conversation meta failed (${res.status}): ${await res.text()}`,
    );
  }
}

// Add one or more tags to the conversation, preserving existing ones
async function addConversationTags(
  sessionId : string,
  tags      : string[],
  websiteId? : string | null,
): Promise<string[]> {
  const existing = await getConversationSegments(sessionId, websiteId);
  const merged   = Array.from(new Set([...existing, ...tags]));

  await setConversationSegments(sessionId, merged, websiteId);

  return merged;
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { getConversationSegments, setConversationSegments, addConversationTags };
export { extractCrispContext, crispConversationUrl };
export type { CrispContext };
