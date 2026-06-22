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
  TH8 : "Refund declined per the Official Refund Policy — the billed cycle was fully used (cancelled after it ended) or usage data proves the app was actively used, and no major problem occurred within 7 days.",
};

const RECOMMENDED_ACTIONS: Record<CaseType, string> = {
  TH1 : "Compute a prorated refund for the unused days in the current cycle (Charge × days_unused ÷ 30) and apply the standard 20% deduction unless a commitment, yearly plan or push-back lowers it.",
  TH2 : "No refund required. Explain that the two charges correspond to two different subscriptions after a plan switch, using the switch-plan formula from the billing docs.",
  TH3 : "Do NOT ask the customer to reinstall. Collect the store URL and billing invoice, then run a prorated refund (num_cycles = 1) with a 20% deduction.",
  TH4 : "Offer two options: (A) App Credit now to offset the upcoming charge, or (B) wait until the bill is Paid and then refund to bank. Escalate App Credit for angry customers.",
  TH5 : "Escalate to Manager (Boo) immediately. Recompute what the customer should have paid on their intended plan and refund the difference.",
  TH6 : "Walk the customer through downgrading to the Free plan. No refund is required unless a paid cycle is still within its unused window.",
  TH7 : "Do NOT ask the customer to reinstall. Issue a prorated refund for the unused portion of the current cycle; multi-cycle refunds require Manager approval.",
  TH8 : "Politely decline using the Official Refund Policy as the basis. Explain the billed cycle was fully used (or cite the usage evidence: published/updated pages + dates). If a NEW charge has since started a fresh partial cycle, offer to refund only that. Never decline a loyal/high-value/at-risk customer yourself — those are routed to Manager instead of TH8.",
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

// A loyal / high-value / at-risk customer is NEVER auto-declined: those are
// routed to a Manager (see deriveManager). Only "ordinary" cases can fall to TH8.
function isSensitive(input: ClassifyRefundCaseInput): boolean {
  return (
    input.subscription_age_years >= 2 ||
    input.is_high_value ||
    input.is_frustrated ||
    input.bad_review_risk ||
    input.already_left_bad_review ||
    input.discount_commitment_claim
  );
}

// Any full-refund (0%) trigger means we WANT to refund, so a decline is off the table.
function hasFullRefundTrigger(input: ClassifyRefundCaseInput): boolean {
  return (
    input.has_prior_commitment ||
    input.feature_issue ||
    input.service_failure ||
    input.is_trial_period ||
    input.is_returning_customer
  );
}

// Layer the decline check on top of the base case: a plain prorated-refund case
// (TH1/TH3) flips to TH8 when the cycle was fully used or usage data proves
// active use — UNLESS the customer is sensitive or something obliges a refund.
function applyDecline(base: CaseType, input: ClassifyRefundCaseInput): CaseType {
  if (base !== "TH1" && base !== "TH3") {
    return base;
  }

  if (isSensitive(input) || hasFullRefundTrigger(input)) {
    return base;
  }

  if (input.used_full_cycle || input.has_recent_usage) {
    return "TH8";
  }

  return base;
}

function deriveDeduction(input: ClassifyRefundCaseInput, caseType: CaseType): number {
  // Honored commitment (human or bot) → full refund, no deduction.
  if (input.has_prior_commitment) {
    return 0;
  }

  // PageFly's fault, a service failure, a trial, or a returning customer → 0%.
  if (
    input.feature_issue ||
    input.service_failure ||
    input.is_trial_period ||
    input.is_returning_customer
  ) {
    return 0;
  }

  // TH2 does not refund; TH8 declines — neither carries a meaningful deduction.
  if (caseType === "TH2" || caseType === "TH8") {
    return 0;
  }

  // Refunding 3+ cycles for an unused app qualifies for the heavier 40% deduction.
  // (A Manager may lower this to retain the customer — see deriveManager.)
  if (input.num_cycles_requested >= 3) {
    return 40;
  }

  // Yearly plans (large amounts) and customers who push back on 20% get the
  // "split Shopify fees equally" rate of 10%.
  if (input.is_yearly_plan || input.customer_counters_deduction) {
    return 10;
  }

  return 20;
}

// Collect the reasons a case must go to Manager (Boo). Empty array = self-decide.
function deriveManagerReasons(input: ClassifyRefundCaseInput, caseType: CaseType): string[] {
  const reasons: string[] = [];

  if (input.num_cycles_requested >= 3) reasons.push("3+ cycles requested");
  if (caseType === "TH5")              reasons.push("unauthorized auto-upgrade (TH5)");
  if (input.has_prior_commitment)      reasons.push("prior refund commitment to honor");
  if (input.subscription_age_years >= 2)
    reasons.push(`loyal customer (~${input.subscription_age_years}y) — prioritise, do not decline`);
  if (input.is_high_value)             reasons.push("high-value account (yearly / multi-store / expensive plan)");
  if (input.is_frustrated)             reasons.push("frustrated / repeat complaints");
  if (input.bad_review_risk)           reasons.push("bad-review risk");
  if (input.already_left_bad_review)   reasons.push("ALREADY left a bad review — recover with full refund");
  if (input.discount_commitment_claim) reasons.push("discount-commitment claim — verify email proof");

  return reasons;
}

/**************************************************************************
 * HANDLER
 ***************************************************************************/

function classifyRefundCaseHandler(
  input: ClassifyRefundCaseInput,
): ClassifyRefundCaseOutput {
  const base_case = classifyCase(input);
  const case_type = applyDecline(base_case, input);

  const manager_reasons = deriveManagerReasons(input, case_type);
  const needs_manager   = manager_reasons.length > 0;

  const needs_shift_manager = input.is_angry;

  const deduction_percent = deriveDeduction(input, case_type);

  // Downgrade to Free is required UNLESS the customer has already uninstalled or
  // closed the store. A declined case (TH8) issues no refund, so no downgrade.
  const requires_downgrade =
    case_type !== "TH8" &&
    input.app_status !== "uninstalled" &&
    input.store_status !== "closed";

  // A refund cannot be processed until the bill is Paid. TH4 uses App Credit
  // instead; TH8 declines so the question is moot.
  const requires_bill_paid = case_type !== "TH4" && case_type !== "TH8";

  return {
    case_type           : case_type,
    case_description    : CASE_DESCRIPTIONS[case_type],
    can_self_decide     : !needs_manager,
    needs_manager       : needs_manager,
    manager_reason      : manager_reasons.join("; "),
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
