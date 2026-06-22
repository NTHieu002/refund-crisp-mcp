/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import type {
  CollectRefundInfoInput,
  CollectRefundInfoOutput,
} from "@/mcp/tools/collect_refund_info/shapes.js";

/**************************************************************************
 * CONSTANTS
 ***************************************************************************/

const STORE_URL_GUIDE_IMAGE = "https://monosnap.ai/direct/S6onmmJVh0bgVTfmo0WGl2p7f4Y7gR";

const QUESTIONS: Record<string, string> = {
  store_url :
    `Could you share your Shopify store URL (the one ending in .myshopify.com) so we can look up the subscription? You can find it in your Shopify Admin — here's a quick visual guide: ${STORE_URL_GUIDE_IMAGE}`,
  billing_invoice :
    "Could you share your Shopify billing invoice? You can find it at Shopify Admin → Settings → Billing → Bills. A screenshot or PDF showing the PageFly charge is perfect.",
  refund_reason :
    "Could you briefly tell us what led you to request a refund? That way we can make sure we propose the right solution.",
  bank_confirmation :
    "Could you confirm the bank account or payment method you'd like the refund to be credited back to?",
};

/**************************************************************************
 * HANDLER
 ***************************************************************************/

function collectRefundInfoHandler(
  input: CollectRefundInfoInput,
): CollectRefundInfoOutput {
  const missing_items: string[] = [];

  if (!input.has_store_url) {
    missing_items.push("store_url");
  }

  if (!input.has_refund_reason) {
    missing_items.push("refund_reason");
  }

  if (!input.has_billing_invoice) {
    missing_items.push("billing_invoice");
  }

  if (!input.has_bank_confirmation) {
    missing_items.push("bank_confirmation");
  }

  // Blockers — only surface one at a time to keep the AI focused
  let blocker: string | null = null;

  if (input.bill_status === "failed") {
    blocker =
      "Payment FAILED (the charge did not go through — the store is usually frozen for the unpaid bill). No money was received, so a cash refund is impossible. Offer an App Credit to offset the PageFly charge so the customer can reactivate (note: the App Credit covers only the PageFly charge, NOT the Shopify subscription, taxes or other apps), OR wait for Shopify to retry until the bill shows Paid, then refund.";
  } else if (input.bill_status === "upcoming") {
    blocker =
      "Bill is still Upcoming. Offer the customer either Option A (App Credit now) or Option B (wait until the bill is Paid, then refund to bank).";
  } else if (input.bill_status === "unknown") {
    blocker =
      "Bill status is unknown. Verify whether the charge is Paid or still Upcoming before proceeding.";
  } else {
    const downgrade_required =
      input.app_status !== "uninstalled" && input.store_status !== "closed";

    if (downgrade_required && !input.is_downgraded_to_free) {
      blocker =
        "Store is still on a paid plan. Ask the customer to downgrade to the Free plan before the refund can be issued.";
    }
  }

  const ready_to_process = missing_items.length === 0 && blocker === null;

  // Next question priority: refund_reason → store_url → billing_invoice → bank_confirmation
  let next_question = "";

  if (!input.has_refund_reason) {
    next_question = QUESTIONS.refund_reason;
  } else if (!input.has_store_url) {
    next_question = QUESTIONS.store_url;
  } else if (!input.has_billing_invoice) {
    next_question = QUESTIONS.billing_invoice;
  } else if (!input.has_bank_confirmation) {
    next_question = QUESTIONS.bank_confirmation;
  }

  return {
    ready_to_process : ready_to_process,
    missing_items    : missing_items,
    next_question    : next_question,
    blocker          : blocker,
  };
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { collectRefundInfoHandler };
