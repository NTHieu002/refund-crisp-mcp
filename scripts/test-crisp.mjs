#!/usr/bin/env node
//
// Test the Crisp API integration using the exact code path the MCP uses.
//
// Usage:
//   node --env-file=.env scripts/test-crisp.mjs <session_id>
//
// What it does:
//   1. GET  /conversation/{session}/meta   — read current segments
//   2. PATCH /conversation/{session}/meta  — add "refund" segment
//   3. GET  again to confirm the write landed
//
// Exits with code 0 on full success, 1 on any API error.

import { addConversationTags, getConversationSegments } from "../dist/src/crisp/client.js";

const sessionId = process.argv[2];

if (!sessionId) {
  console.error("Usage: node --env-file=.env scripts/test-crisp.mjs <session_id>");
  process.exit(1);
}

function preview(value) {
  if (!value) return "(empty)";

  return `${String(value).slice(0, 10)}… (${String(value).length} chars)`;
}

console.log("── Crisp API sanity check ──");
console.log("CRISP_WEBSITE_ID  :", preview(process.env.CRISP_WEBSITE_ID));
console.log("CRISP_IDENTIFIER  :", preview(process.env.CRISP_IDENTIFIER));
console.log("CRISP_KEY         :", preview(process.env.CRISP_KEY));
console.log("Session ID        :", sessionId);
console.log("");

try {
  console.log("Step 1 — GET current segments…");
  const before = await getConversationSegments(sessionId);
  console.log("  OK, segments =", JSON.stringify(before));
  console.log("");

  console.log("Step 2 — PATCH add 'refund' segment…");
  const after = await addConversationTags(sessionId, ["refund"]);
  console.log("  OK, segments =", JSON.stringify(after));
  console.log("");

  console.log("Step 3 — GET again to verify…");
  const confirmed = await getConversationSegments(sessionId);
  console.log("  OK, segments =", JSON.stringify(confirmed));
  console.log("");

  const hasRefund = confirmed.includes("refund");

  if (hasRefund) {
    console.log("✅ Success — 'refund' segment is on the conversation.");
    process.exit(0);
  }

  console.log("⚠️  PATCH returned success but 'refund' is not in the final segments list.");
  process.exit(1);
} catch (error) {
  console.error("❌ Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
