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

const BILL_FAILED_BLOCK = `We can see the latest charge didn't go through, so your store may currently be frozen for the unpaid bill. Because the payment never completed, there's no amount for us to refund — but we can still help you get back up and running:

We can issue an App Credit that offsets the PageFly charge, so when you reactivate you'd only need to cover your Shopify subscription and any other apps. Please note the App Credit applies to the PageFly charge only — not your Shopify plan, taxes, or other apps.

Would you like us to apply the App Credit?`;

const DECLINE_INTRO = `Thank you for reaching out, and we're sorry we won't be able to issue a refund in this case.`;

const REVIEW_NOTE = `Please note this is an estimate; the final amount is subject to review by our team before the refund is processed.`;

const MANAGER_REVIEW_NOTE = `This amount still needs to be confirmed by our team before we process it, so please treat it as an estimate for now.`;

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

  return `Here is an estimate of your refund:
• Plan: ${input.plan_name} (${fmtUsd(input.charge_amount)} USD/cycle)
${cycleLine}${cyclesList}${deductionBlock}

Please let us know if you'd like us to proceed, and we'll confirm the final amount.`;
}

// Currency clarification: the bill may display EUR/CAD/INR/AED while the actual
// charge — and the refund — is in USD.
function currencyNote(input: GenerateRefundMessageInput): string {
  if (!input.bill_currency || input.bill_currency.toUpperCase() === "USD") {
    return "";
  }

  const displayed = input.bill_display_amount !== undefined
    ? `${input.bill_display_amount} ${input.bill_currency.toUpperCase()}`
    : `${input.bill_currency.toUpperCase()}`;

  return `Just to clarify: although your bill shows ${displayed} due to currency conversion, the actual charge — and the refund — is processed in USD (${fmtUsd(input.refund_amount)}).`;
}

// Discount-overcharge correction: refund the difference, keep the plan.
function discountAdjustmentBlock(input: GenerateRefundMessageInput): string {
  return `After reviewing the discount that was promised to you, we can see it wasn't applied correctly, which led to an overcharge. We'd like to make this right:

• Estimated refund of the overcharged difference: ${fmtUsd(input.refund_amount)}
• Going forward, we'll make sure the agreed discount is applied to your plan.

${MANAGER_REVIEW_NOTE}`;
}

// Polite decline (TH8). Built without the refund breakdown — there is no refund.
function declineBlock(input: GenerateRefundMessageInput): string {
  const reason = input.decline_reason.trim().length > 0
    ? input.decline_reason.trim()
    : "the billed cycle was already fully used";

  return `${DECLINE_INTRO}

After reviewing your account, ${reason}, so this charge falls outside what our refund policy covers. If a new charge has since started a fresh billing cycle you haven't used, we'd be glad to look into refunding that portion — just let us know.`;
}

/**************************************************************************
 * HANDLER
 ***************************************************************************/

function generateRefundMessageHandler(
  input: GenerateRefundMessageInput,
): GenerateRefundMessageOutput {
  // A decline (TH8) issues no refund and is sent BEFORE payout details are
  // collected, so it skips the refund gate entirely.
  if (input.case_type === "TH8" || input.is_decline) {
    const parts = [
      input.is_angry ? INTRO_ANGRY() : declineBlock(input),
    ];

    if (input.is_angry) {
      parts.push(declineBlock(input));
    }

    return {
      message                : parts.join("\n\n"),
      needs_customer_confirm : false,
      needs_manager_approve  : false,
    };
  }

  // Handler-level gate: refuse to draft any customer-facing message until the
  // playbook prerequisites are collected. This stops Hugo quoting a refund
  // amount before billing invoice + bank confirmation have been shared. A
  // discount adjustment keeps the plan, so it does not require a downgrade.
  const missing: string[] = [];

  if (!input.has_billing_invoice) missing.push("billing_invoice");
  if (!input.has_bank_confirmation) missing.push("bank_confirmation");
  if (!input.is_discount_adjustment && !input.verified_downgrade_complete) {
    missing.push("downgrade_to_free (verified via check_subscription)");
  }

  if (missing.length > 0) {
    return {
      message :
        `BLOCKED — do NOT send this to the customer. ` +
        `Missing: ${missing.join("; ")}. ` +
        `Collect the items via collect_refund_info. ` +
        `If the plan is still paid per check_subscription, ask the customer to downgrade to the Free plan ` +
        `(Shopify Admin → Apps → PageFly → Pricing → Switch to Free), then re-run check_subscription before retrying.`,
      needs_customer_confirm : false,
      needs_manager_approve  : false,
    };
  }

  const parts: string[] = [];

  parts.push(input.is_angry ? INTRO_ANGRY() : INTRO_DEFAULT(input.customer_name));

  if (input.include_winback && input.case_type !== "TH2" && input.case_type !== "TH5") {
    parts.push(WINBACK_BLOCK);
  }

  // A discount-overcharge correction has its own block regardless of case type.
  if (input.is_discount_adjustment) {
    parts.push(discountAdjustmentBlock(input));
  } else {
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
        if (input.bill_status === "failed") {
          parts.push(BILL_FAILED_BLOCK);
        } else if (input.refund_amount > 0) {
          parts.push(refundBreakdownBlock(input));
        }
        break;
    }
  }

  const needs_manager_approve =
    input.case_type === "TH5" ||
    input.cycles.length >= 3 ||
    input.is_discount_adjustment;

  // Whenever we quote a number, frame it as an estimate. If a Manager still has
  // to sign off, say so explicitly; otherwise add the lighter review note.
  if (input.refund_amount > 0 && !input.is_discount_adjustment) {
    parts.push(needs_manager_approve ? MANAGER_REVIEW_NOTE : REVIEW_NOTE);
  }

  const currency = currencyNote(input);

  if (currency && input.refund_amount > 0) {
    parts.push(currency);
  }

  const needs_customer_confirm =
    input.case_type !== "TH2" && input.refund_amount > 0;

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
