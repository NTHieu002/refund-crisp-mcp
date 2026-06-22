/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import type {
  CalculateRefundInput,
  CalculateRefundOutput,
} from "@/mcp/tools/calculate_refund/shapes.js";

/**************************************************************************
 * CONSTANTS
 ***************************************************************************/

const CYCLE_LENGTH_DAYS = 30;

const DEDUCTION_REASONS: Record<number, string> = {
  0  : "Full refund — no deduction (commitment honored / PageFly fault / trial / returning customer).",
  10 : "Split Shopify processing fees equally — each side covers half (share the Shopify fee breakdown as proof).",
  20 : "15% Shopify transaction processing fee + 5% system maintenance.",
  40 : "Infrastructure & maintenance costs for multiple unused cycles.",
};

/**************************************************************************
 * HELPERS
 ***************************************************************************/

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function daysBetween(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime();

  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function describeDeduction(percent: number): string {
  return (
    DEDUCTION_REASONS[percent] ??
    `Custom ${percent}% deduction applied.`
  );
}

/**************************************************************************
 * HANDLER
 ***************************************************************************/

// Compute a prorated (single cycle) or full (multi cycle) refund with deduction
function calculateRefundHandler(
  input: CalculateRefundInput,
): CalculateRefundOutput {
  const isDiscountAdjustment = input.discount_adjustment !== undefined;

  // Guard: never refund a charge twice. If the dashboard already shows a refund
  // for this charge (e.g. Shopify auto-refunded an unauthorized charge, or a
  // colleague already processed it), refuse outright.
  if (input.already_refunded_amount > 0) {
    return {
      charge_per_cycle    : input.charge_amount,
      total_charge        : 0,
      days_used           : 0,
      days_unused         : 0,
      prorated_amount     : 0,
      deduction_amount    : 0,
      deduction_reason    : "blocked — charge already refunded",
      refund_amount       : 0,
      refund_per_cycle    : 0,
      formula_explanation :
        `ALREADY REFUNDED: the dashboard shows $${input.already_refunded_amount.toFixed(2)} ` +
        `already refunded for this charge. Do NOT issue another refund — verify on the ` +
        `dashboard and tell the customer the refund is already in progress.`,
    };
  }

  // Hard gate: refuse to compute until the playbook info is complete.
  // Handler-level enforcement because tool descriptions alone are routinely
  // ignored by the upstream agent. A discount_adjustment keeps the plan, so the
  // downgrade precondition is waived for it (invoice + bank still required).
  const missing: string[] = [];

  if (!input.has_billing_invoice) missing.push("billing_invoice");
  if (!input.has_bank_confirmation) missing.push("bank_confirmation");
  if (!isDiscountAdjustment && !input.verified_downgrade_complete) {
    missing.push("downgrade_to_free (verified via check_subscription)");
  }

  if (missing.length > 0) {
    const explanation =
      `BLOCKED: cannot compute a refund until: ${missing.join("; ")}. ` +
      `Call collect_refund_info and send its next_question to the customer. ` +
      `If the store is still on a paid plan per check_subscription, ask the ` +
      `customer to go to Shopify Admin → Apps → PageFly → Pricing → Switch to Free, ` +
      `then re-run check_subscription to confirm before retrying.`;

    return {
      charge_per_cycle    : input.charge_amount,
      total_charge        : 0,
      days_used           : 0,
      days_unused         : 0,
      prorated_amount     : 0,
      deduction_amount    : 0,
      deduction_reason    : "blocked — preconditions not met",
      refund_amount       : 0,
      refund_per_cycle    : 0,
      formula_explanation : explanation,
    };
  }

  // Discount-adjustment overcharge: refund the difference between what the
  // customer paid and what they should have paid under the promised discount.
  // No proration, no deduction — this is a billing correction, not a refund of
  // unused time. Always escalate for Manager verification of the email proof.
  if (input.discount_adjustment) {
    const { list_price_usd, discount_percent } = input.discount_adjustment;

    const correct_price = round2(list_price_usd * (1 - clamp(discount_percent, 0, 100) / 100));
    const refund_amount = round2(Math.max(0, input.charge_amount - correct_price));

    return {
      charge_per_cycle    : input.charge_amount,
      total_charge        : input.charge_amount,
      days_used           : 0,
      days_unused         : 0,
      prorated_amount     : input.charge_amount,
      deduction_amount    : round2(input.charge_amount - refund_amount),
      deduction_reason    : "Discount adjustment — refund the overcharged difference (Manager must verify the discount proof).",
      refund_amount       : refund_amount,
      refund_per_cycle    : refund_amount,
      formula_explanation :
        `$${input.charge_amount.toFixed(2)} paid − $${correct_price.toFixed(2)} correct ` +
        `($${list_price_usd.toFixed(2)} × (1 − ${discount_percent}%)) = $${refund_amount.toFixed(2)} difference`,
    };
  }

  const deduction = clamp(input.deduction_percent, 0, 100);
  const cycles    = Math.max(1, Math.floor(input.num_cycles));

  let days_used       : number;
  let days_unused     : number;
  let prorated_amount : number;
  let total_charge    : number;
  let formula         : string;

  if (cycles === 1) {
    const rawDaysUsed = daysBetween(input.cycle_start, input.cancel_date);

    days_used       = clamp(rawDaysUsed, 0, CYCLE_LENGTH_DAYS);
    days_unused     = CYCLE_LENGTH_DAYS - days_used;
    total_charge    = input.charge_amount;
    prorated_amount = round2((input.charge_amount * days_unused) / CYCLE_LENGTH_DAYS);
    formula         = `$${input.charge_amount.toFixed(2)} × ${days_unused}/${CYCLE_LENGTH_DAYS} = $${prorated_amount.toFixed(2)}`;
  } else {
    days_used       = 0;
    days_unused     = CYCLE_LENGTH_DAYS;
    total_charge    = round2(input.charge_amount * cycles);
    prorated_amount = total_charge;
    formula         = `$${input.charge_amount.toFixed(2)} × ${cycles} cycles = $${total_charge.toFixed(2)}`;
  }

  const deduction_amount = round2(prorated_amount * (deduction / 100));
  const refund_amount    = round2(prorated_amount - deduction_amount);
  const refund_per_cycle = round2(refund_amount / cycles);

  const deductionTail = deduction > 0
    ? ` − ${deduction}% deduction = $${refund_amount.toFixed(2)}`
    : "";

  // Cancelled after the cycle ended → the full 30 days were used → nothing to
  // refund for this cycle. Flag it so the agent declines (TH8) rather than
  // quoting $0.00, and only refunds a fresh partial cycle if a new charge began.
  const fullCycleNote = cycles === 1 && days_unused === 0
    ? " — full cycle already used; no refund due for this cycle (treat as TH8 decline unless a NEW charge started a fresh cycle)"
    : "";

  return {
    charge_per_cycle    : input.charge_amount,
    total_charge        : total_charge,
    days_used           : days_used,
    days_unused         : days_unused,
    prorated_amount     : prorated_amount,
    deduction_amount    : deduction_amount,
    deduction_reason    : describeDeduction(deduction),
    refund_amount       : refund_amount,
    refund_per_cycle    : refund_per_cycle,
    formula_explanation : formula + deductionTail + fullCycleNote,
  };
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { calculateRefundHandler };
