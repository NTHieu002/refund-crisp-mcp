/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import type {
  ClassifyRefundCaseInput,
  ClassifyRefundCaseOutput,
} from "@/mcp/tools/classify_refund_case/shapes.js";

/**************************************************************************
 * CONSTANTS
 ***************************************************************************/

type CaseType = ClassifyRefundCaseOutput["case_type"];

const CASE_DESCRIPTIONS: Record<CaseType, string> = {
  TH1 : "Customer cancelled or downgraded mid-cycle and was billed for the full cycle.",
  TH2 : "Customer believes they were double-charged after a mid-cycle plan switch.",
  TH3 : "Customer has already uninstalled the app and is contacting via email/chat.",
  TH4 : "Bill is still Upcoming (not yet processed by Shopify).",
  TH5 : "Customer claims PageFly auto-upgraded their plan without authorization.",
  TH6 : "Customer is asking how to stop being charged.",
  TH7 : "Shopify store has been closed but the PageFly subscription was not cancelled.",
};

const RECOMMENDED_ACTIONS: Record<CaseType, string> = {
  TH1 : "Compute a prorated refund for the unused days in the current cycle (Charge × days_unused ÷ 30) and apply the standard 20% deduction unless a commitment waives it.",
  TH2 : "No refund required. Explain that the two charges correspond to two different subscriptions after a plan switch, using the switch-plan formula from the billing docs.",
  TH3 : "Do NOT ask the customer to reinstall. Collect the store URL and billing invoice, then run a prorated refund (num_cycles = 1) with a 20% deduction.",
  TH4 : "Offer two options: (A) App Credit now to offset the upcoming charge, or (B) wait until the bill is Paid and then refund to bank. Escalate App Credit for angry customers.",
  TH5 : "Escalate to Manager (Boo) immediately. Recompute what the customer should have paid on their intended plan and refund the difference.",
  TH6 : "Walk the customer through downgrading to the Free plan. No refund is required unless a paid cycle is still within its unused window.",
  TH7 : "Do NOT ask the customer to reinstall. Issue a prorated refund for the unused portion of the current cycle; multi-cycle refunds require Manager approval.",
};

/**************************************************************************
 * HELPERS
 ***************************************************************************/

function normalizeReason(reason: string): string {
  return reason.toLowerCase();
}

function mentionsAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

/**************************************************************************
 * CLASSIFIER
 ***************************************************************************/

// Map the conversation context to a case from the playbook using priority rules
function classifyCase(input: ClassifyRefundCaseInput): CaseType {
  const reason = normalizeReason(input.reason);

  // TH5 wins over everything: an unauthorized auto-upgrade always escalates
  if (
    mentionsAny(reason, [
      "auto-upgrade",
      "auto upgrade",
      "automatically upgrade",
      "upgraded without",
      "unauthorized",
      "didn't agree",
      "did not agree",
      "did not authorize",
      "without my permission",
    ])
  ) {
    return "TH5";
  }

  // TH4 — Upcoming bill: special handling regardless of other state
  if (input.bill_status === "upcoming") {
    return "TH4";
  }

  // TH7 — store closed but still on a paid plan
  if (input.store_status === "closed" && input.plan_status === "paid") {
    return "TH7";
  }

  // TH3 — app already uninstalled
  if (input.app_status === "uninstalled") {
    return "TH3";
  }

  // TH2 — confusion about two charges on one bill
  if (mentionsAny(reason, ["double charge", "double-charge", "charged twice", "two charges", "2 charges"])) {
    return "TH2";
  }

  // TH6 — asking how to stop charges (no refund intent)
  if (
    mentionsAny(reason, ["stop being charged", "stop the charge", "stop charging", "cancel billing"]) &&
    !mentionsAny(reason, ["refund"])
  ) {
    return "TH6";
  }

  // TH1 — default: cancel/downgrade mid-cycle
  return "TH1";
}

function deriveDeduction(input: ClassifyRefundCaseInput, caseType: CaseType): number {
  if (input.has_prior_commitment) {
    return 0;
  }

  // TH2 does not refund
  if (caseType === "TH2") {
    return 0;
  }

  // Refunding 3+ cycles for an unused app qualifies for the heavier 40% deduction
  if (input.num_cycles_requested >= 3) {
    return 40;
  }

  return 20;
}

/**************************************************************************
 * HANDLER
 ***************************************************************************/

function classifyRefundCaseHandler(
  input: ClassifyRefundCaseInput,
): ClassifyRefundCaseOutput {
  const case_type = classifyCase(input);

  const needs_manager =
    input.num_cycles_requested >= 3 ||
    case_type === "TH5" ||
    input.has_prior_commitment;

  const needs_shift_manager = input.is_angry;

  const deduction_percent = deriveDeduction(input, case_type);

  // Downgrade to Free is required UNLESS the customer has already uninstalled or closed the store
  const requires_downgrade =
    input.app_status !== "uninstalled" && input.store_status !== "closed";

  // A refund cannot be processed until the bill is Paid (TH4 uses App Credit instead)
  const requires_bill_paid = case_type !== "TH4";

  return {
    case_type           : case_type,
    case_description    : CASE_DESCRIPTIONS[case_type],
    can_self_decide     : !needs_manager,
    needs_manager       : needs_manager,
    needs_shift_manager : needs_shift_manager,
    recommended_action  : RECOMMENDED_ACTIONS[case_type],
    deduction_percent   : deduction_percent,
    requires_downgrade  : requires_downgrade,
    requires_bill_paid  : requires_bill_paid,
  };
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { classifyRefundCaseHandler };
