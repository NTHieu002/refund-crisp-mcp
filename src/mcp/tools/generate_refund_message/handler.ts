/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import type {
  GenerateRefundMessageInput,
  GenerateRefundMessageOutput,
} from "@/mcp/tools/generate_refund_message/shapes.js";

/**************************************************************************
 * SNIPPETS
 ***************************************************************************/

const INTRO_DEFAULT = (name: string) =>
  `Hi ${name}, thanks for your patience while we reviewed your refund request.`;

const INTRO_ANGRY = () =>
  "First of all, I sincerely apologize for the inconvenience you experienced. I completely understand how frustrating this situation must be for you, and I'm truly sorry for the trouble it has caused.";

const WINBACK_BLOCK = `Before we proceed, may I ask what led you to cancel or downgrade PageFly? Were there any specific challenges or features that didn't meet your expectations?

We have a few options that might help:
• Dedicated 1:1 support directly with me for any setup or questions
• Special support from our Technical team who can custom-build features, create custom layouts, and ensure everything is fully responsive for your store
• A 20% discount on your next billing cycle

Of course, I completely respect your decision.`;

const BILL_UPCOMING_BLOCK = `Since your latest bill is still marked as Upcoming, we can offer two options:

Option A — App Credit (faster)
We can issue an App Credit to your store right away that will offset the upcoming charge. This can usually be done within a few hours.

Option B — Refund after payment (standard)
Wait until the bill is processed and shows as Paid, then share the updated screenshot with us and we'll refund to your bank account. Please allow 3–5 business days.

Which option works best for you?`;

const TH2_BLOCK = `Looking at your Shopify bill, what appears as two PageFly charges is actually two separate subscriptions: one prorated for the days you stayed on your previous plan, and one prorated for the remaining days on the new plan. So there's no double-charge — the sum on your bill matches exactly what you would have paid under PageFly's switch-plan formula.`;

const TH5_BLOCK = `We have flagged this case with our Manager. An auto-upgrade on your plan should not have happened without your explicit action, and we're reviewing it right now. We will come back to you shortly with a confirmed refund amount matching the plan you actually intended to be on.`;

const TH6_BLOCK = `To stop being charged going forward, the fastest way is to downgrade your PageFly plan to the Free plan:

Shopify Admin → Apps → PageFly → Pricing → Switch to Free

Once you're on Free, no more charges will be issued. If you'd also like a refund for the unused portion of your current cycle, let us know and we'll take care of it.`;

/**************************************************************************
 * HELPERS
 ***************************************************************************/

function fmtUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  const date = new Date(iso);

  return date.toISOString().slice(0, 10);
}

function joinCycles(cycles: GenerateRefundMessageInput["cycles"]): string {
  return cycles
    .map(
      (cycle) =>
        `• ${fmtDate(cycle.start)} → ${fmtDate(cycle.end)} — ${fmtUsd(cycle.amount)}`,
    )
    .join("\n");
}

function refundBreakdownBlock(input: GenerateRefundMessageInput): string {
  const firstCycle = input.cycles[0];
  const lastCycle  = input.cycles[input.cycles.length - 1];

  const totalCharge   = input.cycles.reduce((sum, cycle) => sum + cycle.amount, 0);
  const proratedBefore = totalCharge > 0
    ? Math.round((input.refund_amount / (1 - input.deduction_percent / 100)) * 100) / 100
    : input.refund_amount;

  const cycleLine = firstCycle && lastCycle
    ? `• Billing cycle: ${fmtDate(firstCycle.start)} – ${fmtDate(lastCycle.end)}`
    : "";

  const cyclesList = input.cycles.length > 1
    ? `\nCycles covered:\n${joinCycles(input.cycles)}`
    : "";

  const deductionBlock = input.deduction_percent > 0
    ? `
A ${input.deduction_percent}% deduction applies to this refund:
${input.deduction_percent === 20
    ? "• 15% — Shopify transaction processing fees which we are unable to recover\n• 5% — System maintenance and infrastructure costs"
    : "• Infrastructure & maintenance costs for multiple unused cycles"}

• Prorated amount: ${fmtUsd(proratedBefore)}
• Deduction (${input.deduction_percent}%): ${fmtUsd(proratedBefore - input.refund_amount)}
• Refund amount: ${fmtUsd(input.refund_amount)}`
    : `
• Refund amount: ${fmtUsd(input.refund_amount)} (full refund, no deduction)`;

  return `Here is the refund breakdown:
• Plan: ${input.plan_name} (${fmtUsd(input.charge_amount)} USD/cycle)
${cycleLine}${cyclesList}${deductionBlock}

Please let us know if you'd like us to proceed with this refund amount.`;
}

/**************************************************************************
 * HANDLER
 ***************************************************************************/

function generateRefundMessageHandler(
  input: GenerateRefundMessageInput,
): GenerateRefundMessageOutput {
  // Handler-level gate: refuse to draft any customer-facing message until the
  // playbook prerequisites are collected. This stops Hugo quoting a refund
  // amount before billing invoice + bank confirmation have been shared.
  const missing: string[] = [];

  if (!input.has_billing_invoice) missing.push("billing_invoice");
  if (!input.has_bank_confirmation) missing.push("bank_confirmation");

  if (missing.length > 0) {
    return {
      message :
        `BLOCKED — do NOT send this to the customer. ` +
        `Missing items: ${missing.join(", ")}. ` +
        `Call collect_refund_info and ask the customer for the missing items first, ` +
        `then retry generate_refund_message after save_case_state records the flags as true.`,
      needs_customer_confirm : false,
      needs_manager_approve  : false,
    };
  }

  const parts: string[] = [];

  parts.push(input.is_angry ? INTRO_ANGRY() : INTRO_DEFAULT(input.customer_name));

  if (input.include_winback && input.case_type !== "TH2" && input.case_type !== "TH5") {
    parts.push(WINBACK_BLOCK);
  }

  switch (input.case_type) {
    case "TH2":
      parts.push(TH2_BLOCK);
      break;

    case "TH4":
      parts.push(BILL_UPCOMING_BLOCK);
      break;

    case "TH5":
      parts.push(TH5_BLOCK);
      break;

    case "TH6":
      parts.push(TH6_BLOCK);

      if (input.refund_amount > 0) {
        parts.push(refundBreakdownBlock(input));
      }
      break;

    default:
      // TH1, TH3, TH7 all resolve with a prorated refund breakdown
      if (input.refund_amount > 0) {
        parts.push(refundBreakdownBlock(input));
      }
      break;
  }

  const needs_customer_confirm =
    input.case_type !== "TH2" && input.refund_amount > 0;

  const needs_manager_approve =
    input.case_type === "TH5" || input.cycles.length >= 3;

  return {
    message                : parts.join("\n\n"),
    needs_customer_confirm : needs_customer_confirm,
    needs_manager_approve  : needs_manager_approve,
  };
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { generateRefundMessageHandler };
