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
  0  : "Full refund — no deduction (team commitment honored).",
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
  // Hard gate: refuse to compute until the playbook info is complete.
  // Handler-level enforcement because tool descriptions alone are routinely
  // ignored by the upstream agent.
  const missing: string[] = [];

  if (!input.has_billing_invoice) missing.push("billing_invoice");
  if (!input.has_bank_confirmation) missing.push("bank_confirmation");

  if (missing.length > 0) {
    const explanation =
      `BLOCKED: cannot compute a refund until the customer has provided: ${missing.join(", ")}. ` +
      `Call collect_refund_info and send its next_question to the customer. ` +
      `Retry calculate_refund only after those items are collected.`;

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
    formula_explanation : formula + deductionTail,
  };
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { calculateRefundHandler };
