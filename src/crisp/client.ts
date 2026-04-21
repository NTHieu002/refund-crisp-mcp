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

function crispBaseUrl(): string {
  const websiteId = process.env.CRISP_WEBSITE_ID;

  if (!websiteId) {
    throw new Error("CRISP_WEBSITE_ID must be set to call the Crisp API.");
  }

  return `https://api.crisp.chat/v1/website/${websiteId}`;
}

/**************************************************************************
 * API
 ***************************************************************************/

// Fetch current segments (tags) on a Crisp conversation
async function getConversationSegments(sessionId: string): Promise<string[]> {
  const url = `${crispBaseUrl()}/conversation/${sessionId}/meta`;

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
): Promise<void> {
  const url = `${crispBaseUrl()}/conversation/${sessionId}/meta`;

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
): Promise<string[]> {
  const existing = await getConversationSegments(sessionId);
  const merged   = Array.from(new Set([...existing, ...tags]));

  await setConversationSegments(sessionId, merged);

  return merged;
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { getConversationSegments, setConversationSegments, addConversationTags };
